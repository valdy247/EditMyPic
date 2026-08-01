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
      return "No encontramos un sujeto claro para separar del fondo."
    case .renderFailed:
      return "No pudimos preparar la máscara del fondo."
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

      let requestHandler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: .up,
        options: [:]
      )

      let mask: CVPixelBuffer
      let mode: String

      if #available(iOS 17.0, *) {
        let request = VNGenerateForegroundInstanceMaskRequest()
        try requestHandler.perform([request])

        guard let observation = request.results?.first,
              !observation.allInstances.isEmpty else {
          throw EditMyPicVisionError.noSubject
        }

        mask = try observation.generateScaledMaskForImage(
          forInstances: observation.allInstances,
          from: requestHandler
        )
        mode = "subjects"
      } else {
        let request = VNGeneratePersonSegmentationRequest()
        request.qualityLevel = .accurate
        request.outputPixelFormat = kCVPixelFormatType_OneComponent8
        try requestHandler.perform([request])

        guard let observation = request.results?.first else {
          throw EditMyPicVisionError.noSubject
        }

        mask = observation.pixelBuffer
        mode = "person"
      }

      let outputURL = try self.writeMask(
        pixelBuffer: mask,
        width: cgImage.width,
        height: cgImage.height
      )

      return [
        "maskUri": outputURL.absoluteString,
        "mode": mode,
        "width": cgImage.width,
        "height": cgImage.height,
      ]
    }
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
    height: Int
  ) throws -> URL {
    var maskImage = CIImage(cvPixelBuffer: pixelBuffer)
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
