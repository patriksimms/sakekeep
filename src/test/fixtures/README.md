# HEIC fixtures

These synthetic fixtures contain HEVC-compressed image data, not renamed JPEGs.
The generated color blocks contain no third-party photo content. They are
dedicated to the public domain under CC0-1.0.

- `display-p3.heic`: the original PR #145 fixture, a 64×48 color block with an
  embedded Display P3 ICC profile generated for the image-pipeline test.
- `primary-alpha.heic`: generated with Pillow and pillow-heif 1.8.1 / libheif
  1.23.6, with a red 64×48 first image and a blue 80×60 primary image. The
  primary image's left half is transparent; its right half is opaque.
- `rotated-p3.heic`: derived from `display-p3.heic` by adding an `irot` property
  with a 90-degree counterclockwise rotation. Its displayed dimensions are
  48×64. It exercises HEIF container rotation rather than JPEG EXIF rotation.

Unit tests verify decoded output, including primary selection, pixels, alpha,
rotation, profile preservation, and metadata removal. The production smoke
journey uploads `primary-alpha.heic` through the shared form and decodes the
stored master and preview after recreating the shipped Bun container.
