import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { analyzePdf, generateAllSummaryLevels } from '@/lib/summarize';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Strategic plans can be large

// POST /api/upload-strategic-plan - Upload and process a strategic plan PDF
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string || 'Strategic Plan';
    const year = formData.get('year') as string || new Date().getFullYear().toString();
    const forceRefresh = formData.get('forceRefresh') === 'true';

    // Ensure database is initialized
    getDb();

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate it's a PDF
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    // Create directory if needed
    const uploadDir = path.join(process.cwd(), 'public', 'documents', 'strategic');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Generate filename from year
    const filename = `fy${year}_strategic_plan.pdf`;
    const filePath = path.join(uploadDir, filename);
    const publicUrl = `/documents/strategic/${filename}`;

    // Save the file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Convert to base64 for AI analysis
    const pdfBase64 = buffer.toString('base64');

    // Generate AI summary
    console.log(`Analyzing strategic plan for FY${year}...`);
    const entityId = `fy${year}`;

    const summary = await analyzePdf(entityId, 'strategic', pdfBase64, {
      forceRefresh,
      metadata: {
        title: `FY${year} Strategic Plan`,
        pdfUrl: publicUrl,
        date: year,
        fileName: filename,
        uploadedAt: new Date().toISOString(),
      },
    });

    console.log(`Generated summary for FY${year} Strategic Plan`);

    // Generate multi-level summaries (headline, brief, detailed)
    console.log(`Generating multi-level summaries for FY${year}...`);
    await generateAllSummaryLevels('strategic', entityId, summary);

    return NextResponse.json({
      success: true,
      entityId,
      title: `FY${year} Strategic Plan`,
      pdfUrl: publicUrl,
      summaryLength: summary.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

// Also support processing an existing file (for the initial setup)
// GET /api/upload-strategic-plan?process=existing&year=2025
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('process');
    const year = searchParams.get('year') || '2025';
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    if (action !== 'existing') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Ensure database is initialized
    getDb();

    // Check if the file exists
    const filename = `fy${year}_strategic_plan.pdf`;
    const filePath = path.join(process.cwd(), 'public', 'documents', 'strategic', filename);
    const publicUrl = `/documents/strategic/${filename}`;

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: `File not found: ${filename}` }, { status: 404 });
    }

    // Read and convert to base64
    const { readFile } = await import('fs/promises');
    const buffer = await readFile(filePath);
    const pdfBase64 = buffer.toString('base64');

    // Generate AI summary
    console.log(`Analyzing existing strategic plan for FY${year}...`);
    const entityId = `fy${year}`;

    const summary = await analyzePdf(entityId, 'strategic', pdfBase64, {
      forceRefresh,
      metadata: {
        title: `FY${year} Strategic Plan`,
        pdfUrl: publicUrl,
        date: year,
        fileName: filename,
        processedAt: new Date().toISOString(),
      },
    });

    console.log(`Generated summary for FY${year} Strategic Plan`);

    // Generate multi-level summaries (headline, brief, detailed)
    console.log(`Generating multi-level summaries for FY${year}...`);
    await generateAllSummaryLevels('strategic', entityId, summary);

    return NextResponse.json({
      success: true,
      entityId,
      title: `FY${year} Strategic Plan`,
      pdfUrl: publicUrl,
      summaryLength: summary.length,
    });
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
