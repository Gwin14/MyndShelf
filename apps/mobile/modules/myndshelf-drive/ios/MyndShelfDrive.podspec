Pod::Spec.new do |s|
  s.name           = 'MyndShelfDrive'
  s.version        = '0.1.0'
  s.summary        = 'A Estante do MyndShelf no app Arquivos'
  s.description    = 'Registra o domínio do File Provider e entrega endereço e token à extensão (targets/drive).'
  s.license        = 'MIT'
  s.author         = 'MyndShelf'
  s.homepage       = 'https://github.com/gwin14/myndshelf'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/gwin14/myndshelf.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'FileProvider'
  s.source_files   = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
