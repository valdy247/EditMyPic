import CoreImage
import ExpoModulesCore
import UIKit
import Vision

private enum EditMyPicVisionError: Error, LocalizedError {
  case invalidImage
  case noSubject
  case renderFailed

  var errorDescription: String? {
    switch self {
    case .invalidImage:
      return "No pudimos leer esta imagen. Prueba con otra foto."
    case .noSubject:
      return "No encontramos un sujeto separado del fondo. Prueba con una persona, mascota u objeto más cercano, o utiliza Borrar para marcar una zona."
    case .renderFailed:
      return "No pudimos preparar el recorte. Inténtalo nuevamente."
    }
  }
}

public class EditMyPicVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EditMyPicVision")

    Function("isSupported") { () -> Bool in
      true
    }

    AsyncFunction("createForegroundMask") { (uri: String) -> [String: Any] in
      let sourceURL = self.fileURL(from: uri)
      guard let image = UIImage(contentsOfFile: sourceURL.path),
            let cgImage = self.normalizedCGImage(from: image) else {
        throw EditMyPicVisionError.invalidImage
      }

      let result = try self.generateBestMask(for: cgImage)
      let outputURL = try self.writeMask(
        pixelBuffer: result.mask,
        width: cgImage.width,
        height: cgImage.height,
        enhanceSoftMask: result.enhanceSoftMask
      )

      return [
        "maskUri": outputURL.absoluteString,
        "mode": result.mode,
        "width": cgImage.width,
        "height": cgImage.height,
      ]
    }
  }

  private func generateBestMask(
    for cgImage: CGImage
  ) throws -> (mask: CVPixelBuffer, mode: String, enhanceSoftMask: Bool) {
    if #available(iOS 17.0, *) {
      let requestHandler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: .up,
        options: [:]
      )
      let request = VNGenerateForegroundInstanceMaskRequest()
      try requestHandler.perform([request])

      if let observation = request.results?.first,
         !observation.allInstances.isEmpty {
        let mask = try observation.generateScaledMaskForImage(
          forInstances: observation.allInstances,
          from: requestHandler
        )
        return (mask, "subjects", false)
      }
    } else {
      let requestHandler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: .up,
        options: [:]
      )
      let request = VNGeneratePersonSegmentationRequest()
      request.qualityLevel = .accurate
      request.outputPixelFormat = kCVPixelFormatType_OneComponent8
      try requestHandler.perform([request])

      if let observation = request.results?.first {
        return (observation.pixelBuffer, "person", false)
      }
    }

    if let saliencyMask = try self.generateSaliencyMask(for: cgImage) {
      return (saliencyMask, "subjects", true)
    }

    throw EditMyPicVisionError.noSubject
  }

  private func generateSaliencyMask(for cgImage: CGImage) throws -> CVPixelBuffer? {
    let objectHandler = VNImageRequestHandler(
      cgImage: cgImage,
      orientation: .up,
      options: [:]
    )
    let objectRequest = VNGenerateObjectnessBasedSaliencyImageRequest()
    try objectHandler.perform([objectRequest])

    if let observation = objectRequest.results?.first,
       observation.salientObjects?.isEmpty == false {
      return observation.pixelBuffer
    }

    let attentionHandler = VNImageRequestHandler(
      cgImage: cgImage,
      orientation: .up,
      options: [:]
    )
    let attentionRequest = VNGenerateAttentionBasedSaliencyImageRequest()
    try attentionHandler.perform([attentionRequest])

    if let observation = attentionRequest.results?.first,
       observation.salientObjects?.isEmpty == false {
      return observation.pixelBuffer
    }

    return nil
  }

  private func fileURL(from uri: String) -> URL {
    if let url = URL(string: uri), url.isFileURL {
      return url
    }
    return URL(fileURLWithPath: uri.replacingOccurrences(of: "file://", with: ""))
  }

  private func normalizedCGImage(from image: UIImage) -> CGImage? {
    if image.imageOrientation == .up, let cgImage = image.cgImage {
      return cgImage
    }

    let size = CGSize(
      width: max(1, image.size.width * image.scale),
      height: max(1, image.size.height * image.scale)
    )
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = false

    return UIGraphicsImageRenderer(size: size, format: format)
      .image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
      .cgImage
  }

  private func writeMask(
    pixelBuffer: CVPixelBuffer,
    width: Int,
    height: Int,
    enhanceSoftMask: Bool
  ) throws -> URL {
    var maskImage = CIImage(cvPixelBuffer: pixelBuffer)

    if enhanceSoftMask {
      maskImage = maskImage
        .applyingFilter(
          "CIGammaAdjust",
          parameters: ["inputPower": 0.72]
        )
        .applyingFilter(
          "CIColorControls",
          parameters: [
            kCIInputContrastKey: 3.2,
            kCIInputBrightnessKey: -0.08,
          ]
        )
    }

    let targetWidth = CGFloat(width)
    let targetHeight = CGFloat(height)
    let scaleX = targetWidth / max(1, maskImage.extent.width)
    let scaleY = targetHeight / max(1, maskImage.extent.height)

    maskImage = maskImage
      .transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
      .cropped(to: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))

    let context = CIContext(options: [.cacheIntermediates: false])
    guard let maskCGImage = context.createCGImage(maskImage, from: maskImage.extent),
          let data = UIImage(cgImage: maskCGImage).pngData() else {
      throw EditMyPicVisionError.renderFailed
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("editmypic-mask-\(UUID().uuidString).png")
    try data.write(to: outputURL, options: .atomic)
    return outputURL
  }
}
