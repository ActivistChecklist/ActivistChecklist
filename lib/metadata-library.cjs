const fs = require('fs/promises')
const fsSync = require('fs')
const path = require('path')
const { execFile } = require('child_process')

// Try to load sharp, but handle gracefully if it fails
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  const isVercel = process.env.VERCEL === '1';
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isVercel) {
    console.warn('⚠️ Sharp not available on Vercel, image processing will be skipped:', error.message);
  } else if (isDevelopment) {
    console.error('❌ Sharp is required for development but not available:', error.message);
    console.error('💡 Run: yarn add sharp');
    throw new Error('Sharp is required for development');
  } else {
    console.warn('⚠️ Sharp not available, image processing will be skipped:', error.message);
  }
  sharp = null;
}

const { PDFDocument } = require('pdf-lib')
const ffmpeg = require('fluent-ffmpeg')
const { promisify } = require('util')
const { createReadStream } = require('fs')
const { pipeline } = require('stream/promises')
const execFileAsync = promisify(execFile)

/**
 * Metadata Stripper Library
 * Provides functionality to strip metadata from images, PDFs, and videos
 */
class MetadataStripper {
  constructor(options = {}) {
    this.verbose = options.verbose || false
    this.backup = options.backup || false
    this.supportedImageTypes = options.imageTypes || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'bmp']
    this.supportedPdfTypes = options.pdfTypes || ['pdf']
    this.supportedVideoTypes = options.videoTypes || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv']
  }

  /**
   * Check if a file type is supported for metadata stripping
   */
  isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1)
    return this.supportedImageTypes.includes(ext) ||
      this.supportedPdfTypes.includes(ext) ||
      this.supportedVideoTypes.includes(ext)
  }

  /**
   * Get the file type category
   */
  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1)
    if (this.supportedImageTypes.includes(ext)) return 'image'
    if (this.supportedPdfTypes.includes(ext)) return 'pdf'
    if (this.supportedVideoTypes.includes(ext)) return 'video'
    return 'unsupported'
  }

  /**
   * Strip metadata from an image file
   */
  async stripImageMetadata(inputBuffer, originalFilePath = null) {
    if (!sharp) {
      throw new Error('Sharp is not available for image processing')
    }

    try {
      // Sharp strips metadata by default unless withMetadata() is used.
      const strippedBuffer = await sharp(inputBuffer)
        .toBuffer()

      // Check if XMP metadata still exists (Sharp doesn't always remove XMP from PNGs)
      const verifyMetadata = await sharp(strippedBuffer).metadata()
      if (verifyMetadata.xmpAsString) {
        // Sharp failed to remove XMP, use exiftool as fallback
        if (this.verbose) {
          console.log(`    ⚠️ Sharp failed to remove XMP, using exiftool fallback`)
        }

        // Write to temp file for exiftool processing
        const fileExt = originalFilePath ? path.extname(originalFilePath) : '.png'
        const tempPath = '/tmp/metadata_temp_' + Date.now() + fileExt
        await fs.writeFile(tempPath, strippedBuffer)

        try {
          // Use exiftool to remove all metadata
          await execFileAsync('exiftool', ['-all=', '-overwrite_original', tempPath])

          // Read the cleaned file back
          const cleanedBuffer = await fs.readFile(tempPath)

          // Clean up temp file
          await fs.unlink(tempPath)

          // Verify XMP was removed (only if Sharp is available)
          const finalMetadata = sharp ? await sharp(cleanedBuffer).metadata() : null
          if (finalMetadata && finalMetadata.xmpAsString) {
            throw new Error('exiftool failed to remove XMP metadata')
          }

          if (this.verbose) {
            console.log(`    ✓ exiftool successfully removed XMP metadata`)
          }

          return cleanedBuffer
        } catch (exiftoolError) {
          // Clean up temp file on error
          try {
            await fs.unlink(tempPath)
          } catch { }
          throw new Error(`Both Sharp and exiftool failed to remove XMP metadata: ${exiftoolError.message}`)
        }
      }

      if (this.verbose) {
        console.log(`    ✓ Stripped image metadata (${Math.round(strippedBuffer.length / 1024)}KB)`)
      }

      return strippedBuffer
    } catch (error) {
      throw new Error(`Failed to strip image metadata: ${error.message}`)
    }
  }

  /**
   * Strip metadata from a PDF file
   */
  async stripPdfMetadata(inputBuffer) {
    try {
      const pdfDoc = await PDFDocument.load(inputBuffer)

      // Remove all metadata
      pdfDoc.setTitle('')
      pdfDoc.setAuthor('')
      pdfDoc.setSubject('')
      pdfDoc.setKeywords([])
      pdfDoc.setProducer('')
      pdfDoc.setCreator('')
      pdfDoc.setCreationDate(new Date())
      pdfDoc.setModificationDate(new Date())

      const strippedBuffer = await pdfDoc.save()

      if (this.verbose) {
        console.log(`    ✓ Stripped PDF metadata (${Math.round(strippedBuffer.length / 1024)}KB)`)
      }

      return strippedBuffer
    } catch (error) {
      throw new Error(`Failed to strip PDF metadata: ${error.message}`)
    }
  }

  /**
   * Strip metadata from a video file
   */
  async stripVideoMetadata(inputBuffer, outputPath) {
    return new Promise((resolve, reject) => {
      // Write input buffer to temporary file
      const tempInputPath = outputPath + '.temp'
      fsSync.writeFileSync(tempInputPath, inputBuffer)

      ffmpeg(tempInputPath)
        .outputOptions([
          '-map_metadata', '-1',  // Remove all metadata
          '-map', '0',            // Copy all streams
          '-c', 'copy'            // Copy without re-encoding
        ])
        .output(outputPath)
        .on('end', () => {
          // Clean up temp file
          fsSync.unlinkSync(tempInputPath)
          if (this.verbose) {
            console.log(`    ✓ Stripped video metadata`)
          }
          resolve()
        })
        .on('error', (error) => {
          // Clean up temp file
          if (fsSync.existsSync(tempInputPath)) {
            fsSync.unlinkSync(tempInputPath)
          }
          reject(new Error(`Failed to strip video metadata: ${error.message}`))
        })
        .run()
    })
  }

  /**
   * Run a final metadata wipe using exiftool.
   * This catches residual fields like ICC profile names or container tags.
   */
  async stripAllMetadataWithExiftool(filePath) {
    try {
      await execFileAsync('exiftool', ['-all=', '-overwrite_original', filePath])
      if (this.verbose) {
        console.log(`    ✓ Applied final exiftool metadata wipe`)
      }
    } catch (error) {
      throw new Error(`Failed final exiftool wipe: ${error.message}`)
    }
  }

  /**
   * Strip metadata from a single file
   */
  async stripFileMetadata(filePath) {
    const fileType = this.getFileType(filePath)

    if (fileType === 'unsupported') {
      throw new Error(`Unsupported file type: ${path.extname(filePath)}`)
    }

    // Create backup if requested
    if (this.backup) {
      const backupPath = filePath + '.backup'
      await fs.copyFile(filePath, backupPath)
      if (this.verbose) {
        console.log(`    📁 Created backup: ${path.basename(backupPath)}`)
      }
    }

    const inputBuffer = await fs.readFile(filePath)

    if (fileType === 'image') {
      const strippedBuffer = await this.stripImageMetadata(inputBuffer, filePath)
      await fs.writeFile(filePath, strippedBuffer)
    } else if (fileType === 'pdf') {
      const strippedBuffer = await this.stripPdfMetadata(inputBuffer)
      await fs.writeFile(filePath, strippedBuffer)
    } else if (fileType === 'video') {
      await this.stripVideoMetadata(inputBuffer, filePath)
    }

    await this.stripAllMetadataWithExiftool(filePath)

    return {
      filePath,
      fileType,
      originalSize: inputBuffer.length,
      success: true
    }
  }

  /**
   * Strip metadata from all supported files in a directory
   */
  async stripDirectoryMetadata(dirPath) {
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      files: []
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // Recursively process subdirectories
          const subResults = await this.stripDirectoryMetadata(fullPath)
          results.processed += subResults.processed
          results.skipped += subResults.skipped
          results.errors += subResults.errors
          results.files.push(...subResults.files)
        } else if (entry.isFile() && this.isSupported(fullPath)) {
          try {
            if (this.verbose) {
              console.log(`🔄 Processing: ${entry.name}`)
            }

            const result = await this.stripFileMetadata(fullPath)
            results.files.push(result)
            results.processed++

            if (this.verbose) {
              console.log(`✅ Success: ${entry.name}`)
            }
          } catch (error) {
            results.errors++
            results.files.push({
              filePath: fullPath,
              fileType: this.getFileType(fullPath),
              success: false,
              error: error.message
            })

            if (this.verbose) {
              console.log(`❌ Error: ${entry.name} - ${error.message}`)
            }
          }
        } else {
          results.skipped++
          if (this.verbose) {
            console.log(`⏭️ Skipped: ${entry.name} (unsupported type)`)
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to process directory: ${error.message}`)
    }

    return results
  }

  /**
   * Analyze metadata from an image file
   */
  async analyzeImageMetadata(filePath) {
    if (!sharp) {
      return {
        concerns: [{
          level: 'high',
          type: 'sharp_unavailable',
          message: 'Sharp is not available for metadata analysis',
          recommendation: 'Install Sharp to enable metadata analysis'
        }],
        summary: 'Sharp not available'
      }
    }

    try {
      const metadata = await sharp(filePath).metadata()
      const concerns = []

      // Check for EXIF metadata
      if (metadata.exif) {
        const exif = metadata.exif

        // Check for GPS coordinates
        if (exif.GPSLatitude && exif.GPSLongitude) {
          concerns.push({
            level: 'high',
            type: 'gps_location',
            field: 'GPS Coordinates',
            value: `${exif.GPSLatitude}, ${exif.GPSLongitude}`,
            description: 'Contains GPS location data'
          })
        }

        // Check for camera serial number
        if (exif.CameraSerialNumber) {
          concerns.push({
            level: 'high',
            type: 'camera_serial',
            field: 'Camera Serial Number',
            value: exif.CameraSerialNumber,
            description: 'Contains camera serial number'
          })
        }

        // Check for lens serial number
        if (exif.LensSerialNumber) {
          concerns.push({
            level: 'high',
            type: 'lens_serial',
            field: 'Lens Serial Number',
            value: exif.LensSerialNumber,
            description: 'Contains lens serial number'
          })
        }

        // Check for software information
        if (exif.Software) {
          concerns.push({
            level: 'medium',
            type: 'software_info',
            field: 'Software',
            value: exif.Software,
            description: 'Contains software information'
          })
        }

        // Check for artist/author information
        if (exif.Artist) {
          concerns.push({
            level: 'high',
            type: 'author_info',
            field: 'Artist',
            value: exif.Artist,
            description: 'Contains artist/author information'
          })
        }

        // Check for copyright information
        if (exif.Copyright) {
          concerns.push({
            level: 'high',
            type: 'copyright_info',
            field: 'Copyright',
            value: exif.Copyright,
            description: 'Contains copyright information'
          })
        }

        // Check for image description (often location or story context)
        if (exif.ImageDescription && String(exif.ImageDescription).trim()) {
          concerns.push({
            level: 'medium',
            type: 'description_info',
            field: 'Image Description',
            value: exif.ImageDescription,
            description: 'Contains EXIF image description text'
          })
        }

        // Check for camera make and model (can be identifying)
        if (exif.Make || exif.Model) {
          const cameraInfo = [exif.Make, exif.Model].filter(Boolean).join(' ')
          concerns.push({
            level: 'medium',
            type: 'camera_info',
            field: 'Camera Make/Model',
            value: cameraInfo,
            description: 'Contains camera make and model information'
          })
        }

        // Check for lens information
        if (exif.LensModel) {
          concerns.push({
            level: 'medium',
            type: 'lens_info',
            field: 'Lens Model',
            value: exif.LensModel,
            description: 'Contains lens model information'
          })
        }

        // Check for creation date/time (can narrow identity or timeline)
        if (exif.DateTime || exif.DateTimeOriginal) {
          const dateValue = exif.DateTimeOriginal || exif.DateTime
          concerns.push({
            level: 'medium',
            type: 'date_info',
            field: 'Creation Date/Time',
            value: dateValue,
            description: 'Contains creation date/time information'
          })
        }

        // Check for user comment
        if (exif.UserComment) {
          concerns.push({
            level: 'medium',
            type: 'user_comment',
            field: 'User Comment',
            value: exif.UserComment,
            description: 'Contains user comment'
          })
        }

        // Check for host computer information (machine name is often uniquely identifying)
        if (exif.HostComputer) {
          concerns.push({
            level: 'high',
            type: 'computer_info',
            field: 'Host Computer',
            value: exif.HostComputer,
            description: 'Contains host computer or device name'
          })
        }

        // Body or internal serial numbers
        if (exif.BodySerialNumber) {
          concerns.push({
            level: 'high',
            type: 'body_serial',
            field: 'Body Serial Number',
            value: exif.BodySerialNumber,
            description: 'Contains camera body serial number'
          })
        }

        // Owner or photographer name in EXIF
        if (exif.OwnerName) {
          concerns.push({
            level: 'high',
            type: 'owner_info',
            field: 'Owner Name',
            value: exif.OwnerName,
            description: 'Contains owner or photographer name'
          })
        }

        // Check for processing software
        if (exif.ProcessingSoftware) {
          concerns.push({
            level: 'medium',
            type: 'software_info',
            field: 'Processing Software',
            value: exif.ProcessingSoftware,
            description: 'Contains processing software information'
          })
        }
      }

      // Check for IPTC metadata (IIM dataset numbers as used by libvips/sharp)
      if (metadata.iptc) {
        const iptc = metadata.iptc

        // 2#080 By-line, 2#085 By-line Title, 2#090 often used for byline-related in legacy bundles
        if (iptc['2#080']) {
          concerns.push({
            level: 'high',
            type: 'author_info',
            field: 'IPTC By-line (Photographer)',
            value: iptc['2#080'],
            description: 'Contains IPTC photographer or author name'
          })
        }
        if (iptc['2#085']) {
          concerns.push({
            level: 'medium',
            type: 'author_title',
            field: 'IPTC By-line Title',
            value: iptc['2#085'],
            description: 'Contains IPTC by-line title or role'
          })
        }
        if (iptc['2#090']) {
          concerns.push({
            level: 'medium',
            type: 'iptc_misc',
            field: 'IPTC Field 090',
            value: iptc['2#090'],
            description: 'Contains IPTC supplementary byline or legacy field'
          })
        }

        // 2#116 Copyright Notice
        if (iptc['2#116']) {
          concerns.push({
            level: 'high',
            type: 'copyright_info',
            field: 'IPTC Copyright Notice',
            value: iptc['2#116'],
            description: 'Contains IPTC copyright notice'
          })
        }

        // 2#120 Caption/Abstract (can describe location or private context)
        if (iptc['2#120']) {
          concerns.push({
            level: 'medium',
            type: 'caption_info',
            field: 'IPTC Caption/Abstract',
            value: iptc['2#120'],
            description: 'Contains IPTC caption or description text'
          })
        }

        // 2#105 Headline, 2#110 Credit, 2#115 Source
        if (iptc['2#105']) {
          concerns.push({
            level: 'medium',
            type: 'headline_info',
            field: 'IPTC Headline',
            value: iptc['2#105'],
            description: 'Contains IPTC headline'
          })
        }
        if (iptc['2#110']) {
          concerns.push({
            level: 'medium',
            type: 'credit_info',
            field: 'IPTC Credit',
            value: iptc['2#110'],
            description: 'Contains IPTC credit line'
          })
        }
        if (iptc['2#115']) {
          concerns.push({
            level: 'medium',
            type: 'source_info',
            field: 'IPTC Source',
            value: iptc['2#115'],
            description: 'Contains IPTC source or publication name'
          })
        }

        // 2#040 Special Instructions
        if (iptc['2#040']) {
          concerns.push({
            level: 'medium',
            type: 'instructions_info',
            field: 'IPTC Special Instructions',
            value: iptc['2#040'],
            description: 'Contains IPTC special instructions'
          })
        }

        // 2#055 Date Created, 2#060 Time Created
        if (iptc['2#055']) {
          concerns.push({
            level: 'medium',
            type: 'date_info',
            field: 'IPTC Date Created',
            value: iptc['2#055'],
            description: 'Contains IPTC creation date'
          })
        }
        if (iptc['2#060']) {
          concerns.push({
            level: 'medium',
            type: 'date_info',
            field: 'IPTC Time Created',
            value: iptc['2#060'],
            description: 'Contains IPTC creation time'
          })
        }

        if (iptc['2#025']) { // Keywords
          concerns.push({
            level: 'medium',
            type: 'keywords',
            field: 'IPTC Keywords',
            value: iptc['2#025'],
            description: 'Contains IPTC keywords that might be identifying'
          })
        }
      }

      // Check for XMP metadata (common in PNG files)
      if (metadata.xmpAsString) {
        const xmpString = metadata.xmpAsString

        const pushXmpField = (level, type, field, value, description) => {
          if (!value || !String(value).trim()) return
          concerns.push({
            level,
            type,
            field,
            value: String(value).trim(),
            description
          })
        }

        const matchXmpTag = (localName) => {
          const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const patterns = [
            new RegExp(`<[^>:]*:?${escaped}[^>]*>\\s*<rdf:Bag>\\s*<rdf:li[^>]*>([^<]+)<\\/rdf:li>`, 'i'),
            new RegExp(`<[^>:]*:?${escaped}[^>]*>\\s*<rdf:Seq>\\s*<rdf:li[^>]*>([^<]+)<\\/rdf:li>`, 'i'),
            new RegExp(`<[^>:]*:?${escaped}[^>]*>\\s*<rdf:Alt>\\s*<rdf:li[^>]*>([^<]+)<\\/rdf:li>`, 'i'),
            new RegExp(`<[^>:]*:?${escaped}[^>]*>([^<]+)<\\/[^>:]*:?${escaped}>`, 'i')
          ]
          for (const re of patterns) {
            const m = xmpString.match(re)
            if (m && m[1] && m[1].trim()) return m[1].trim()
          }
          return null
        }

        // Author/creator (do not treat CreatorTool as author; that is software)
        const authorMatch = xmpString.match(/<pdf:Author>([^<]+)<\/pdf:Author>/i) ||
          xmpString.match(/<dc:creator>([^<]+)<\/dc:creator>/i) ||
          xmpString.match(/<dc:creator>\s*<rdf:Bag>\s*<rdf:li>([^<]+)<\/rdf:li>/i) ||
          xmpString.match(/<dc:creator>\s*<rdf:Seq>\s*<rdf:li>([^<]+)<\/rdf:li>/i)

        if (authorMatch) {
          concerns.push({
            level: 'high',
            type: 'author_info',
            field: 'XMP Author/Creator',
            value: authorMatch[1],
            description: 'Contains XMP author or creator information'
          })
        }

        // PLUS / rights: identifiers and URLs are strongly identifying
        const plusHighTags = [
          { tag: 'CopyrightOwnerID', field: 'XMP PLUS Copyright Owner ID' },
          { tag: 'CopyrightOwnerName', field: 'XMP PLUS Copyright Owner Name' },
          { tag: 'ImageCreatorID', field: 'XMP PLUS Image Creator ID' },
          { tag: 'ImageCreatorName', field: 'XMP PLUS Image Creator Name' },
          { tag: 'LicensorID', field: 'XMP PLUS Licensor ID' },
          { tag: 'LicensorName', field: 'XMP PLUS Licensor Name' },
          { tag: 'LicensorURL', field: 'XMP PLUS Licensor URL' }
        ]
        plusHighTags.forEach(({ tag, field }) => {
          const val = matchXmpTag(tag)
          if (val) {
            pushXmpField('high', 'plus_identity', field, val, 'Contains XMP PLUS rights or creator identifier')
          }
        })

        // Photoshop / publishing workflow
        const photoshopCredit = matchXmpTag('Credit')
        if (photoshopCredit) {
          pushXmpField('medium', 'credit_info', 'XMP Photoshop Credit', photoshopCredit, 'Contains XMP Photoshop credit line')
        }
        const photoshopHeadline = matchXmpTag('Headline')
        if (photoshopHeadline) {
          pushXmpField('medium', 'headline_info', 'XMP Photoshop Headline', photoshopHeadline, 'Contains XMP Photoshop headline')
        }
        const photoshopInstructions = matchXmpTag('Instructions')
        if (photoshopInstructions) {
          pushXmpField('medium', 'instructions_info', 'XMP Photoshop Instructions', photoshopInstructions, 'Contains XMP Photoshop instructions')
        }
        const photoshopDateCreated = matchXmpTag('DateCreated')
        if (photoshopDateCreated) {
          pushXmpField('medium', 'date_info', 'XMP Photoshop Date Created', photoshopDateCreated, 'Contains XMP Photoshop creation date')
        }

        // xmpRights usage and policy URLs
        const usageTerms = matchXmpTag('UsageTerms') || xmpString.match(/<xmpRights:UsageTerms>([^<]+)<\/xmpRights:UsageTerms>/i)
        if (usageTerms) {
          const v = typeof usageTerms === 'string' ? usageTerms : usageTerms[1]
          pushXmpField('medium', 'rights_terms', 'XMP Rights Usage Terms', v, 'Contains XMP usage or licensing terms')
        }
        const webStatement = matchXmpTag('WebStatement') || xmpString.match(/<xmpRights:WebStatement>([^<]+)<\/xmpRights:WebStatement>/i)
        if (webStatement) {
          const v = typeof webStatement === 'string' ? webStatement : webStatement[1]
          pushXmpField('medium', 'rights_url', 'XMP Rights Web Statement', v, 'Contains XMP rights web statement URL or text')
        }

        // Generic URL strings embedded in XMP (accounts, personal sites)
        const urlMatches = xmpString.match(/https?:\/\/[^\s"'<>]{4,200}/gi)
        if (urlMatches && urlMatches.length > 0) {
          const uniqueUrls = [...new Set(urlMatches)].slice(0, 5).join(', ')
          pushXmpField('medium', 'embedded_urls', 'XMP Embedded URLs', uniqueUrls, 'Contains HTTP(S) URLs in XMP payload')
        }

        // Check for title information in XMP (handles nested structure)
        const titleMatch = xmpString.match(/<dc:title>\s*<rdf:Alt>\s*<rdf:li[^>]*>([^<]+)<\/rdf:li>/i) ||
          xmpString.match(/<dc:title>([^<]+)<\/dc:title>/i)
        if (titleMatch) {
          concerns.push({
            level: 'medium',
            type: 'title_info',
            field: 'XMP Title',
            value: titleMatch[1],
            description: 'Contains XMP title information'
          })
        }

        // Check for description information in XMP
        const descriptionMatch = xmpString.match(/<dc:description>\s*<rdf:Alt>\s*<rdf:li[^>]*>([^<]+)<\/rdf:li>/i) ||
          xmpString.match(/<dc:description>([^<]+)<\/dc:description>/i)
        if (descriptionMatch) {
          concerns.push({
            level: 'medium',
            type: 'description_info',
            field: 'XMP Description',
            value: descriptionMatch[1],
            description: 'Contains XMP description information'
          })
        }

        // Check for keywords in XMP
        const keywordsMatch = xmpString.match(/<dc:subject>\s*<rdf:Bag>\s*<rdf:li>([^<]+)<\/rdf:li>/i) ||
          xmpString.match(/<dc:subject>([^<]+)<\/dc:subject>/i)
        if (keywordsMatch) {
          concerns.push({
            level: 'medium',
            type: 'keywords_info',
            field: 'XMP Keywords',
            value: keywordsMatch[1],
            description: 'Contains XMP keywords information'
          })
        }

        // Check for copyright information in XMP
        const copyrightMatch = xmpString.match(/<dc:rights>\s*<rdf:Alt>\s*<rdf:li[^>]*>([^<]+)<\/rdf:li>/i) ||
          xmpString.match(/<dc:rights>([^<]+)<\/dc:rights>/i) ||
          xmpString.match(/<xmpRights:Copyright>([^<]+)<\/xmpRights:Copyright>/i)
        if (copyrightMatch) {
          concerns.push({
            level: 'high',
            type: 'copyright_info',
            field: 'XMP Copyright',
            value: copyrightMatch[1],
            description: 'Contains XMP copyright information'
          })
        }

        // Software/creator tool (separate from dc:creator person name)
        const creatorToolMatch = xmpString.match(/<xmp:CreatorTool>([^<]+)<\/xmp:CreatorTool>/i) ||
          matchXmpTag('CreatorTool')
        if (creatorToolMatch) {
          const toolVal = typeof creatorToolMatch === 'string' ? creatorToolMatch : creatorToolMatch[1]
          pushXmpField('medium', 'software_info', 'XMP Creator Tool', toolVal, 'Contains XMP creator tool or software name')
        }

        // XMP toolkit string (workflow fingerprint)
        const xmpToolkit = xmpString.match(/<x:xmpmeta[^>]*x:xmptk="([^"]+)"/i) ||
          xmpString.match(/x:xmptk="([^"]+)"/i)
        if (xmpToolkit && xmpToolkit[1]) {
          pushXmpField('medium', 'software_info', 'XMP Toolkit', xmpToolkit[1], 'Contains XMP toolkit identifier')
        }

        // Check for creation date/time
        const dateMatch = xmpString.match(/<xmp:CreateDate>([^<]+)<\/xmp:CreateDate>/i) ||
          xmpString.match(/<dc:date>\s*<rdf:Seq>\s*<rdf:li>([^<]+)<\/rdf:li>/i)
        if (dateMatch) {
          concerns.push({
            level: 'medium',
            type: 'date_info',
            field: 'XMP Creation Date',
            value: dateMatch[1],
            description: 'Contains XMP creation date information'
          })
        }

        // Check for modification date/time
        const modDateMatch = xmpString.match(/<xmp:ModifyDate>([^<]+)<\/xmp:ModifyDate>/i)
        if (modDateMatch) {
          concerns.push({
            level: 'medium',
            type: 'date_info',
            field: 'XMP Modification Date',
            value: modDateMatch[1],
            description: 'Contains XMP modification date information'
          })
        }
      }

      return {
        filePath,
        fileType: 'image',
        hasMetadata: concerns.length > 0,
        concerns,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          hasExif: !!metadata.exif,
          hasIptc: !!metadata.iptc,
          hasXmp: !!metadata.xmpAsString
        }
      }
    } catch (error) {
      return {
        filePath,
        fileType: 'image',
        hasMetadata: false,
        concerns: [],
        error: error.message
      }
    }
  }

  /**
   * Analyze metadata from a PDF file
   */
  async analyzePdfMetadata(filePath) {
    try {
      const buffer = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(buffer)
      const concerns = []

      // Check PDF metadata
      const title = pdfDoc.getTitle()
      const author = pdfDoc.getAuthor()
      const subject = pdfDoc.getSubject()
      const keywords = pdfDoc.getKeywords()
      const producer = pdfDoc.getProducer()
      const creator = pdfDoc.getCreator()
      const creationDate = pdfDoc.getCreationDate()
      const modificationDate = pdfDoc.getModificationDate()

      // High concern items
      if (author && author.trim()) {
        concerns.push({
          level: 'high',
          type: 'author_info',
          field: 'Author',
          value: author,
          description: 'Contains author information'
        })
      }

      if (creator && creator.trim()) {
        concerns.push({
          level: 'medium',
          type: 'software_info',
          field: 'Creator',
          value: creator,
          description: 'Contains software creator information'
        })
      }

      if (producer && producer.trim() && !producer.toLowerCase().includes('pdf-lib')) {
        concerns.push({
          level: 'medium',
          type: 'software_info',
          field: 'Producer',
          value: producer,
          description: 'Contains software producer information'
        })
      }

      // Medium concern items
      if (title && title.trim()) {
        concerns.push({
          level: 'medium',
          type: 'title',
          field: 'Title',
          value: title,
          description: 'Contains document title'
        })
      }

      if (subject && subject.trim()) {
        concerns.push({
          level: 'medium',
          type: 'subject',
          field: 'Subject',
          value: subject,
          description: 'Contains document subject'
        })
      }

      if (keywords && Array.isArray(keywords) && keywords.length > 0) {
        concerns.push({
          level: 'medium',
          type: 'keywords',
          field: 'Keywords',
          value: keywords.join(', '),
          description: 'Contains keywords that might be identifying'
        })
      }

      return {
        filePath,
        fileType: 'pdf',
        hasMetadata: concerns.length > 0,
        concerns,
        metadata: {
          pageCount: pdfDoc.getPageCount(),
          hasTitle: !!title,
          hasAuthor: !!author,
          hasSubject: !!subject,
          hasKeywords: keywords && Array.isArray(keywords) && keywords.length > 0,
          hasProducer: !!producer,
          hasCreator: !!creator
        }
      }
    } catch (error) {
      return {
        filePath,
        fileType: 'pdf',
        hasMetadata: false,
        concerns: [],
        error: error.message
      }
    }
  }

  /**
   * Analyze metadata from a video file using ffprobe
   */
  async analyzeVideoMetadata(filePath) {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve({
            filePath,
            fileType: 'video',
            hasMetadata: false,
            concerns: [],
            error: err.message
          })
          return
        }

        const concerns = []

        // Check metadata tags
        if (metadata.format && metadata.format.tags) {
          const tags = metadata.format.tags

          // High concern items
          if (tags.artist || tags.author || tags.comment) {
            concerns.push({
              level: 'high',
              type: 'author_info',
              field: 'Artist/Author/Comment',
              value: tags.artist || tags.author || tags.comment,
              description: 'Contains author or comment information'
            })
          }

          if (tags.title) {
            concerns.push({
              level: 'medium',
              type: 'title',
              field: 'Title',
              value: tags.title,
              description: 'Contains video title'
            })
          }

          if (tags.album) {
            concerns.push({
              level: 'medium',
              type: 'album',
              field: 'Album',
              value: tags.album,
              description: 'Contains album information'
            })
          }

          if (tags.genre) {
            concerns.push({
              level: 'low',
              type: 'genre',
              field: 'Genre',
              value: tags.genre,
              description: 'Contains genre information'
            })
          }

        }

        resolve({
          filePath,
          fileType: 'video',
          hasMetadata: concerns.length > 0,
          concerns,
          metadata: {
            duration: metadata.format.duration,
            size: metadata.format.size,
            bitRate: metadata.format.bit_rate,
            hasTags: !!(metadata.format && metadata.format.tags)
          }
        })
      })
    })
  }

  /**
   * Scan a single file for metadata concerns
   */
  async scanFile(filePath) {
    const fileType = this.getFileType(filePath)

    if (fileType === 'unsupported') {
      return {
        filePath,
        fileType: 'unsupported',
        hasMetadata: false,
        concerns: [],
        error: 'Unsupported file type'
      }
    }

    if (fileType === 'image') {
      return await this.analyzeImageMetadata(filePath)
    } else if (fileType === 'pdf') {
      return await this.analyzePdfMetadata(filePath)
    } else if (fileType === 'video') {
      return await this.analyzeVideoMetadata(filePath)
    }
  }

  /**
   * Scan all supported files in a directory for metadata concerns
   */
  async scanDirectory(dirPath) {
    const results = {
      totalFiles: 0,
      scannedFiles: 0,
      filesWithMetadata: 0,
      highConcerns: 0,
      mediumConcerns: 0,
      lowConcerns: 0,
      errors: 0,
      files: []
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subResults = await this.scanDirectory(fullPath)
          results.totalFiles += subResults.totalFiles
          results.scannedFiles += subResults.scannedFiles
          results.filesWithMetadata += subResults.filesWithMetadata
          results.highConcerns += subResults.highConcerns
          results.mediumConcerns += subResults.mediumConcerns
          results.lowConcerns += subResults.lowConcerns
          results.errors += subResults.errors
          results.files.push(...subResults.files)
        } else if (entry.isFile() && this.isSupported(fullPath)) {
          results.totalFiles++

          try {
            const scanResult = await this.scanFile(fullPath)
            results.files.push(scanResult)
            results.scannedFiles++

            if (scanResult.hasMetadata) {
              results.filesWithMetadata++

              // Count concerns by level
              scanResult.concerns.forEach(concern => {
                if (concern.level === 'high') results.highConcerns++
                else if (concern.level === 'medium') results.mediumConcerns++
                else if (concern.level === 'low') results.lowConcerns++
              })
            }

            if (this.verbose) {
              if (scanResult.hasMetadata) {
                console.log(`⚠️  Found ${scanResult.concerns.length} metadata concerns: ${entry.name}`)
              } else {
                console.log(`✅ clean: ${entry.name}`)
              }
            }
          } catch (error) {
            results.errors++
            results.files.push({
              filePath: fullPath,
              fileType: this.getFileType(fullPath),
              hasMetadata: false,
              concerns: [],
              error: error.message
            })

            if (this.verbose) {
              console.log(`❌ Error: ${entry.name} - ${error.message}`)
            }
          }
        } else {
          results.totalFiles++
        }
      }
    } catch (error) {
      throw new Error(`Failed to scan directory: ${error.message}`)
    }

    return results
  }

  /**
   * Scan files or directories for metadata concerns
   */
  async scan(inputPath) {
    const stats = await fs.stat(inputPath)

    if (stats.isFile()) {
      if (!this.isSupported(inputPath)) {
        throw new Error(`Unsupported file type: ${path.extname(inputPath)}`)
      }

      const scanResult = await this.scanFile(inputPath)
      return {
        totalFiles: 1,
        scannedFiles: 1,
        filesWithMetadata: scanResult.hasMetadata ? 1 : 0,
        highConcerns: scanResult.concerns.filter(c => c.level === 'high').length,
        mediumConcerns: scanResult.concerns.filter(c => c.level === 'medium').length,
        lowConcerns: scanResult.concerns.filter(c => c.level === 'low').length,
        errors: scanResult.error ? 1 : 0,
        files: [scanResult]
      }
    } else if (stats.isDirectory()) {
      return await this.scanDirectory(inputPath)
    } else {
      throw new Error(`Invalid input: ${inputPath} is neither a file nor a directory`)
    }
  }

  /**
   * Generate a detailed report from scan results
   */
  generateReport(scanResults) {
    const report = {
      summary: {
        totalFiles: scanResults.totalFiles,
        scannedFiles: scanResults.scannedFiles,
        filesWithMetadata: scanResults.filesWithMetadata,
        highConcerns: scanResults.highConcerns,
        mediumConcerns: scanResults.mediumConcerns,
        lowConcerns: scanResults.lowConcerns,
        errors: scanResults.errors
      },
      highConcerns: [],
      mediumConcerns: [],
      lowConcerns: [],
      filesWithMetadata: []
    }

    // Categorize files by concern level
    scanResults.files.forEach(file => {
      if (file.hasMetadata) {
        report.filesWithMetadata.push(file)

        file.concerns.forEach(concern => {
          if (concern.level === 'high') {
            report.highConcerns.push({ ...concern, filePath: file.filePath })
          } else if (concern.level === 'medium') {
            report.mediumConcerns.push({ ...concern, filePath: file.filePath })
          } else if (concern.level === 'low') {
            report.lowConcerns.push({ ...concern, filePath: file.filePath })
          }
        })
      }
    })

    return report
  }

  /**
   * Strip metadata from files or directories
   */
  async stripMetadata(inputPath) {
    const stats = await fs.stat(inputPath)

    if (stats.isFile()) {
      if (!this.isSupported(inputPath)) {
        throw new Error(`Unsupported file type: ${path.extname(inputPath)}`)
      }

      const result = await this.stripFileMetadata(inputPath)
      return {
        processed: 1,
        skipped: 0,
        errors: 0,
        files: [result]
      }
    } else if (stats.isDirectory()) {
      return await this.stripDirectoryMetadata(inputPath)
    } else {
      throw new Error(`Invalid input: ${inputPath} is neither a file nor a directory`)
    }
  }

  /**
   * Strip metadata from selected files based on scan results
   */
  async stripSelectedFiles(scanResults, selectedFilePaths) {
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      files: []
    }

    for (const filePath of selectedFilePaths) {
      try {
        const result = await this.stripFileMetadata(filePath)
        results.files.push(result)
        results.processed++

        if (this.verbose) {
          console.log(`✅ Stripped metadata from: ${path.basename(filePath)}`)
        }
      } catch (error) {
        results.errors++
        results.files.push({
          filePath,
          fileType: this.getFileType(filePath),
          success: false,
          error: error.message
        })

        if (this.verbose) {
          console.log(`❌ Error stripping ${path.basename(filePath)}: ${error.message}`)
        }
      }
    }

    return results
  }
}

module.exports = { MetadataStripper }
