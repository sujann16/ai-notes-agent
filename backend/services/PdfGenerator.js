const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const StorageManager = require("../utils/StorageManager");

class PdfGenerator {
  static cleanUnicode(text) {
    if (!text) return "";
    return text
      .replace(/💡/g, "Tip: ")
      .replace(/❌/g, " [X] ")
      .replace(/✅/g, " [OK] ")
      .replace(/→/g, "->")
      .replace(/➔/g, "->")
      .replace(/⇒/g, "=>")
      .replace(/•/g, "*")
      .replace(/[\u2018\u2019]/g, "'") // smart quotes
      .replace(/[\u201C\u201D]/g, '"') // smart double quotes
      .replace(/[^\x00-\x7F]/g, ""); // strip any remaining non-ASCII characters to prevent rendering boxes
  }

  static checkPageSpace(doc, neededSpace) {
    const bottomMargin = 50;
    const pageHeight = doc.page.height;
    if (doc.y + neededSpace > pageHeight - bottomMargin) {
      doc.addPage();
      doc.x = doc.leftMargin || 50;
    }
  }

  static parseInlineStyles(text) {
    const spans = [];
    const tokenRegex = /(\*\*|\*)/g;
    let currentBold = false;
    let currentItalic = false;
    
    let lastIndex = 0;
    let match;
    
    while ((match = tokenRegex.exec(text)) !== null) {
      const token = match[0];
      const index = match.index;
      
      if (index > lastIndex) {
        spans.push({
          text: text.substring(lastIndex, index),
          bold: currentBold,
          italic: currentItalic
        });
      }
      
      if (token === '**') {
        currentBold = !currentBold;
      } else if (token === '*') {
        currentItalic = !currentItalic;
      }
      
      lastIndex = tokenRegex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      spans.push({
        text: text.substring(lastIndex),
        bold: currentBold,
        italic: currentItalic
      });
    }
    
    if (spans.length === 0 && text.length > 0) {
      spans.push({ text, bold: false, italic: false });
    }
    
    return spans.filter(s => s.text !== '');
  }

  static renderSpans(doc, spans, options = {}) {
    spans.forEach((span, idx) => {
      let font = 'Helvetica';
      if (span.bold && span.italic) {
        font = 'Helvetica-BoldOblique';
      } else if (span.bold) {
        font = 'Helvetica-Bold';
      } else if (span.italic) {
        font = 'Helvetica-Oblique';
      }
      
      doc.font(font);
      
      const isLast = idx === spans.length - 1;
      const textOptions = {
        continued: !isLast,
        ...options
      };
      doc.text(span.text, textOptions);
    });
  }

  static renderHeading(doc, text, size, color, gapBefore) {
    const leftMargin = doc.leftMargin || 50;
    const printWidth = doc.printWidth || 512;
    this.checkPageSpace(doc, size + gapBefore + 70);
    doc.moveDown(gapBefore / 10);
    const cleanText = text.replace(/\*\*/g, '');
    doc.fontSize(size).fillColor(color).font('Helvetica-Bold');
    doc.x = leftMargin;
    doc.text(cleanText, { width: printWidth });
    doc.x = leftMargin;
    doc.moveDown(0.3);
  }

  static renderHorizontalRule(doc) {
    const leftMargin = doc.leftMargin || 50;
    const printWidth = doc.printWidth || 512;
    this.checkPageSpace(doc, 20);
    doc.moveDown(0.5);
    doc.strokeColor('#e2e8f0')
       .lineWidth(1)
       .moveTo(leftMargin, doc.y)
       .lineTo(leftMargin + printWidth, doc.y)
       .stroke();
    doc.moveDown(0.5);
  }

  static renderBlockquote(doc, text) {
    const leftMargin = doc.leftMargin || 50;
    const printWidth = doc.printWidth || 512;
    const padding = 10;
    const width = printWidth;
    
    doc.font('Helvetica').fontSize(10);
    const spans = this.parseInlineStyles(text);
    const plainText = spans.map(s => s.text).join('');
    const textHeight = doc.heightOfString(plainText, { width: width - (padding * 2) - 10 });
    const blockHeight = textHeight + (padding * 2);
    
    this.checkPageSpace(doc, blockHeight + 10);
    
    const startX = leftMargin;
    const startY = doc.y;
    
    doc.fillColor('#f7fafc')
       .rect(startX, startY, width, blockHeight)
       .fill();
       
    doc.strokeColor('#2b6cb0')
       .lineWidth(4)
       .moveTo(startX, startY)
       .lineTo(startX, startY + blockHeight)
       .stroke();
       
    doc.x = startX + padding + 4;
    doc.y = startY + padding;
    
    const italicSpans = spans.map(s => ({ ...s, italic: true }));
    this.renderSpans(doc, italicSpans, { width: width - (padding * 2) - 10 });
    
    doc.x = leftMargin;
    doc.y = startY + blockHeight;
    doc.moveDown(0.8);
  }

  static renderListItem(doc, marker, content, indentLevel) {
    const leftMargin = doc.leftMargin || 50;
    const printWidth = doc.printWidth || 512;
    const indent = 15 + (indentLevel * 10);
    const contentWidth = printWidth - indent;
    
    doc.font('Helvetica').fontSize(10);
    const textHeight = doc.heightOfString(content, { width: contentWidth });
    this.checkPageSpace(doc, textHeight + 5);
    
    const startY = doc.y;
    
    let cleanMarker = marker;
    if (marker === '-' || marker === '*') {
      cleanMarker = '•';
    }
    
    doc.font('Helvetica-Bold').fillColor('#2d3748');
    doc.text(cleanMarker, leftMargin + indent - 15, startY);
    
    doc.x = leftMargin + indent;
    doc.y = startY;
    
    const spans = this.parseInlineStyles(content);
    this.renderSpans(doc, spans, { width: contentWidth });
    
    doc.x = leftMargin;
    doc.moveDown(0.3);
  }

  static renderParagraph(doc, text) {
    const leftMargin = doc.leftMargin || 50;
    const printWidth = doc.printWidth || 512;
    const spans = this.parseInlineStyles(text);
    const plainText = spans.map(s => s.text).join('');
    
    doc.font('Helvetica').fontSize(10);
    const textHeight = doc.heightOfString(plainText, { width: printWidth });
    this.checkPageSpace(doc, textHeight + 10);
    
    doc.fillColor('#2d3748');
    doc.x = leftMargin;
    this.renderSpans(doc, spans, { width: printWidth });
    doc.x = leftMargin;
    doc.moveDown(0.5);
  }

  static renderTable(doc, tableLines) {
    const rows = [];
    tableLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.includes('---') && !trimmed.startsWith('|')) return;
      if (trimmed.startsWith('|') && trimmed.includes('---')) return;
      
      const cells = trimmed.split('|')
        .map(c => c.trim())
        .filter((c, index, arr) => index > 0 && index < arr.length - 1);
        
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
    
    if (rows.length === 0) return;
    
    const numCols = rows[0].length;
    const leftMargin = doc.leftMargin || 50;
    const startX = leftMargin;
    const totalWidth = doc.printWidth || 512;
    
    const colWidths = [];
    if (numCols === 2) {
      colWidths.push(Math.round(totalWidth * 0.3), Math.round(totalWidth * 0.7));
    } else if (numCols === 3) {
      colWidths.push(Math.round(totalWidth * 0.22), Math.round(totalWidth * 0.46), Math.round(totalWidth * 0.32));
    } else {
      const evenWidth = totalWidth / numCols;
      for (let j = 0; j < numCols; j++) {
        colWidths.push(evenWidth);
      }
    }
    
    const cellPadding = 6;
    
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const isHeader = r === 0;
      
      let rowHeight = 0;
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      
      for (let c = 0; c < Math.min(row.length, numCols); c++) {
        const cellText = row[c].replace(/\*\*/g, '');
        const innerWidth = colWidths[c] - (cellPadding * 2);
        const cellHeight = doc.heightOfString(cellText, { width: innerWidth });
        if (cellHeight > rowHeight) {
          rowHeight = cellHeight;
        }
      }
      
      rowHeight += cellPadding * 2;
      
      this.checkPageSpace(doc, rowHeight + 10);
      
      const currentY = doc.y;
      
      if (isHeader) {
        doc.fillColor('#2c3e50')
           .rect(startX, currentY, totalWidth, rowHeight)
           .fill();
      } else if (r % 2 === 1) {
        doc.fillColor('#f8fafc')
           .rect(startX, currentY, totalWidth, rowHeight)
           .fill();
      }
      
      let currentX = startX;
      for (let c = 0; c < Math.min(row.length, numCols); c++) {
        const cellText = row[c];
        const cellW = colWidths[c];
        
        doc.x = currentX + cellPadding;
        doc.y = currentY + cellPadding;
        
        doc.fontSize(8);
        if (isHeader) {
          doc.fillColor('#ffffff').font('Helvetica-Bold');
          doc.text(cellText, { width: cellW - (cellPadding * 2) });
        } else {
          doc.fillColor('#2d3748');
          const spans = this.parseInlineStyles(cellText);
          this.renderSpans(doc, spans, { width: cellW - (cellPadding * 2) });
        }
        
        currentX += cellW;
      }
      
      doc.strokeColor('#e2e8f0')
         .lineWidth(0.5)
         .moveTo(startX, currentY + rowHeight)
         .lineTo(startX + totalWidth, currentY + rowHeight)
         .stroke();
         
      doc.x = startX;
      doc.y = currentY + rowHeight;
    }
    
    doc.moveDown(0.8);
  }

  static drawMarkdown(sessionId, doc, markdown) {
    const blocks = markdown.split(/(?=### Topic:)/);
    
    blocks.forEach(block => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return;
      
      const diagramMatch = trimmedBlock.match(/\[DIAGRAM:\s*([^\]]+)\]/);
      
      if (diagramMatch) {
        const diagramFilename = diagramMatch[1].trim();
        const cleanedBlock = trimmedBlock.replace(/\[DIAGRAM:\s*[^\]]+\]\r?\n?/, "");
        
        const lines = cleanedBlock.split('\n');
        let headingLine = "";
        let restLines = [];
        
        if (lines[0].startsWith('### Topic:')) {
          headingLine = lines[0];
          restLines = lines.slice(1);
        } else {
          restLines = lines;
        }
        
        doc.printWidth = 512;
        doc.leftMargin = 50;
        doc.x = 50;
        if (headingLine) {
          this.renderHeading(doc, headingLine.substring(4), 12, '#2d3748', 8);
        }
        
        if (doc.y + 125 > 742) {
          doc.addPage();
        }
        
        const startPageRange = doc.bufferedPageRange();
        const startPageIndex = startPageRange.count - 1;
        const contentStartY = doc.y;
        
        doc.printWidth = 280;
        doc.leftMargin = 50;
        doc.x = 50;
        
        this.drawLines(doc, restLines);
        
        const endPageRange = doc.bufferedPageRange();
        const endPageIndex = endPageRange.count - 1;
        const contentEndY = doc.y;
        
        const imagePath = path.join(StorageManager.getFramesDir(sessionId), diagramFilename);
        if (fs.existsSync(imagePath)) {
          try {
            doc.switchToPage(startPageIndex);
            doc.image(imagePath, 350, contentStartY, { width: 212 });
            doc.switchToPage(endPageIndex);
          } catch (imgErr) {
            console.error(`[PdfGenerator] Failed to render image ${diagramFilename}:`, imgErr);
            doc.switchToPage(endPageIndex);
          }
        } else {
          console.warn(`[PdfGenerator] Diagram image not found at: ${imagePath}`);
        }
        
        doc.printWidth = 512;
        doc.leftMargin = 50;
        doc.x = 50;
        
        if (startPageIndex === endPageIndex) {
          const imageEndY = contentStartY + 119.25;
          doc.y = Math.max(contentEndY, imageEndY);
        } else {
          doc.y = contentEndY;
        }
        doc.moveDown(0.8);
      } else {
        doc.printWidth = 512;
        doc.leftMargin = 50;
        doc.x = 50;
        this.drawLines(doc, trimmedBlock.split('\n'));
      }
    });
  }

  static drawLines(doc, lines) {
    let i = 0;
    while (i < lines.length) {
      let line = lines[i];
      let trimmed = line.trim();
      
      if (trimmed === '') {
        doc.moveDown(0.3);
        i++;
        continue;
      }
      
      if (trimmed.startsWith('>')) {
        let quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().substring(1).trim());
          i++;
        }
        this.renderBlockquote(doc, quoteLines.join(' '));
        continue;
      }
      
      if (trimmed.startsWith('|')) {
        let tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        this.renderTable(doc, tableLines);
        continue;
      }
      
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        this.renderHorizontalRule(doc);
        i++;
        continue;
      }
      
      if (trimmed.startsWith('# ')) {
        this.renderHeading(doc, trimmed.substring(2), 20, '#1a365d', 12);
        i++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        this.renderHeading(doc, trimmed.substring(3), 16, '#2c5282', 10);
        i++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        this.renderHeading(doc, trimmed.substring(4), 12, '#2d3748', 8);
        i++;
        continue;
      }
      
      const bulletMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
      if (bulletMatch) {
        const indentLevel = bulletMatch[1].length;
        const marker = bulletMatch[2];
        const content = bulletMatch[3];
        this.renderListItem(doc, marker, content, indentLevel);
        i++;
        continue;
      }
      
      this.renderParagraph(doc, trimmed);
      i++;
    }
  }

  static generate(sessionId, notesText) {
    return new Promise((resolve, reject) => {
      try {
        const pdfPath = StorageManager.getPdfPath(sessionId);
        const cleanedNotes = this.cleanUnicode(notesText);

        const doc = new PDFDocument({
          margin: 50,
          bufferPages: true
        });

        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        // Header Title (on page 1)
        doc.fillColor('#1a365d').font('Helvetica-Bold').fontSize(22).text("AI Lecture Notes", { align: 'center' });
        doc.moveDown(0.3);
        doc.strokeColor('#1a365d').lineWidth(2).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(1);

        // Draw parsed markdown
        this.drawMarkdown(sessionId, doc, cleanedNotes);

        // Draw page numbers and headers/footers on all pages
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          
          // Temporarily set margins to 0 to prevent auto-page break
          const oldBottomMargin = doc.page.margins.bottom;
          doc.page.margins.bottom = 0;
          
          // Draw header
          doc.fontSize(8).fillColor('#718096').font('Helvetica');
          doc.text("AI LECTURE STUDY NOTES", 50, 20, { width: 512, align: 'left' });
          doc.text("GENERATED BY LEARNING AGENT", 50, 20, { width: 512, align: 'right' });
          
          // Thin line
          doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, 32).lineTo(562, 32).stroke();
          
          // Draw footer
          doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, 750).lineTo(562, 750).stroke();
          doc.text(`Page ${i + 1} of ${pages.count}`, 50, 760, { width: 512, align: 'center' });
          
          // Restore margins
          doc.page.margins.bottom = oldBottomMargin;
        }

        doc.end();
        writeStream.on("finish", () => {
          console.log(`[PdfGenerator] PDF successfully written to ${pdfPath}`);
          resolve(pdfPath);
        });
        writeStream.on("error", (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = PdfGenerator;
