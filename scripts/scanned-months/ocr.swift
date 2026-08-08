import Foundation
import PDFKit
import Vision
import CoreGraphics

// OCR a scanned PDF with macOS Vision, reconstructing table rows from the
// geometry rather than trusting Vision's reading order — on a dense
// nine-column permit table it emits whole columns at a time, which silently
// decouples a permit number from the address on its own row.
//
// The page is physically rotated to each candidate orientation and the one
// yielding the most text wins, because some months were scanned sideways.
// Fragments are then bucketed by vertical position and ordered left to right
// within each bucket, so a printed row comes out as a row.

let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("usage: ocr <file.pdf> [rowTolerance]\n".data(using: .utf8)!)
    exit(1)
}
let rowTolerance = args.count >= 3 ? Double(args[2])! : 0.006

let scale: CGFloat = 3.0

func render(_ page: PDFPage) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let w = Int(bounds.width * scale), h = Int(bounds.height * scale)
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.setFillColor(CGColor(gray: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    return ctx.makeImage()
}

func rotate(_ image: CGImage, quarterTurns: Int) -> CGImage? {
    if quarterTurns % 4 == 0 { return image }
    let swap = quarterTurns % 2 != 0
    let w = swap ? image.height : image.width
    let h = swap ? image.width : image.height
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.translateBy(x: CGFloat(w) / 2, y: CGFloat(h) / 2)
    ctx.rotate(by: CGFloat(quarterTurns) * .pi / 2)
    ctx.translateBy(x: -CGFloat(image.width) / 2, y: -CGFloat(image.height) / 2)
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return ctx.makeImage()
}

struct Fragment { let text: String; let x: Double; let y: Double }

func recognize(_ image: CGImage) -> [Fragment] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false   // permit codes and parcels are not words
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try? handler.perform([request])
    return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return Fragment(text: candidate.string, x: Double(box.minX), y: Double(box.midY))
    }
}

// Group fragments sharing a horizontal band, then read each band left to right.
func rows(_ fragments: [Fragment]) -> [String] {
    let sorted = fragments.sorted { $0.y > $1.y }   // Vision's origin is bottom-left
    var bands: [[Fragment]] = []
    for fragment in sorted {
        if var last = bands.last, let anchor = last.first, abs(anchor.y - fragment.y) <= rowTolerance {
            last.append(fragment)
            bands[bands.count - 1] = last
        } else {
            bands.append([fragment])
        }
    }
    return bands.map { band in
        band.sorted { $0.x < $1.x }.map(\.text).joined(separator: "  ")
    }
}

for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i), let base = render(page) else { continue }
    var best: (Int, [Fragment]) = (0, [])
    for turns in 0..<4 {
        guard let image = rotate(base, quarterTurns: turns) else { continue }
        let fragments = recognize(image)
        let volume = fragments.reduce(0) { $0 + $1.text.count }
        if volume > best.1.reduce(0, { $0 + $1.text.count }) { best = (turns, fragments) }
    }
    let lines = rows(best.1)
    print("===== PAGE \(i + 1) (quarter turns: \(best.0), \(lines.count) rows) =====")
    for line in lines { print(line) }
}
