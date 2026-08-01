Pod::Spec.new do |s|
  s.name           = 'EditMyPicVision'
  s.version        = '0.1.0'
  s.summary        = 'Private on-device subject segmentation for EditMyPic.'
  s.description    = 'Uses Apple Vision to generate foreground masks without uploading photos.'
  s.author         = 'Valdy'
  s.homepage       = 'https://github.com/valdy247/EditMyPic'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => 'https://github.com/valdy247/EditMyPic.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.frameworks = 'Vision', 'CoreImage', 'UIKit', 'ImageIO'
  s.swift_version = '5.9'
end
