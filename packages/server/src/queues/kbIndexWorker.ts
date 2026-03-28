import { Worker, Job } from 'bullmq';
import { Pinecone } from '@pinecone-database/pinecone';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { env } from '../config/env.js';
import { QUEUES, TEXT_SPLITTER_CONFIG } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { KBDocument } from '../models/KBDocument.js';
import { batchEmbed } from '../services/rag.js';

const childLogger = logger.child({ worker: 'kbIndex' });

// Initialize Pinecone
const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
const pineconeIndex = pinecone.index(env.PINECONE_INDEX);

// Parse Upstash Redis URL for BullMQ connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

const connectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

// Socket.io instance will be set via init function
let io: {
  to: (room: string) => { emit: (event: string, data: unknown) => void };
} | null = null;

/**
 * Initialize the KB Index worker with Socket.io instance
 */
export function initKBIndexWorker(
  socketIo: typeof io
): void {
  io = socketIo;
  childLogger.info('KB Index worker initialized with Socket.io');
}

/**
 * Emit index progress to company room
 */
function emitProgress(
  companyId: string,
  documentId: string,
  progress: number,
  status: string
): void {
  if (!io) return;
  io.to(`company:${companyId}`).emit('kb:indexProgress', {
    documentId,
    progress,
    status,
  });
}

/**
 * Job data interface
 */
export interface KBIndexJobData {
  documentId: string;
  companyId: string;
}

/**
 * Extract text from URL using cheerio
 */
async function extractTextFromURL(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OmniSupportBot/1.0)',
      },
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove script, style, nav, footer elements
    $('script, style, nav, footer, header, aside, iframe').remove();
    
    // Get main content or body text
    const mainContent = $('main, article, .content, #content, .main').first();
    const text = mainContent.length > 0
      ? mainContent.text()
      : $('body').text();
    
    // Clean up whitespace
    return text.replace(/\s+/g, ' ').trim();
  } catch (error) {
    childLogger.error({ error, url }, 'Failed to extract text from URL');
    throw new Error(`Failed to fetch URL: ${(error as Error).message}`);
  }
}

/**
 * Extract text from PDF (placeholder - needs pdf-parse in production)
 */
async function extractTextFromPDF(s3Key: string): Promise<string> {
  // TODO: Implement S3 download + pdf-parse
  // const s3Client = new S3Client({ region: env.AWS_REGION });
  // const pdfBuffer = await s3Client.send(new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: s3Key }));
  // const pdfData = await pdfParse(pdfBuffer);
  // return pdfData.text;
  
  childLogger.warn({ s3Key }, 'PDF extraction not yet implemented, returning placeholder');
  return `[PDF content from ${s3Key} - extraction pending implementation]`;
}

/**
 * Split text into chunks using LangChain
 */
async function splitText(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: TEXT_SPLITTER_CONFIG.CHUNK_SIZE,
    chunkOverlap: TEXT_SPLITTER_CONFIG.CHUNK_OVERLAP,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  });
  
  const docs = await splitter.createDocuments([text]);
  return docs.map((doc) => doc.pageContent);
}

/**
 * Process KB index job
 */
async function processKBIndexJob(job: Job<KBIndexJobData>): Promise<{
  chunkCount: number;
  status: string;
}> {
  const { documentId, companyId } = job.data;
  const startTime = Date.now();
  
  childLogger.info({ documentId, companyId, jobId: job.id }, 'Starting KB document indexing');
  
  try {
    // Step 1: Fetch document from MongoDB
    const document = await KBDocument.findOne({ _id: documentId, companyId });
    
    if (!document) {
      throw new Error('Document not found');
    }
    
    // Update status to processing
    document.status = 'processing';
    await document.save();
    emitProgress(companyId, documentId, 10, 'processing');
    
    // Step 2: Extract text based on source type
    let rawText: string;
    
    switch (document.sourceType) {
      case 'pdf':
        if (!document.s3Key) {
          throw new Error('PDF document missing S3 key');
        }
        rawText = await extractTextFromPDF(document.s3Key);
        break;
        
      case 'url':
        if (!document.sourceUrl) {
          throw new Error('URL document missing source URL');
        }
        rawText = await extractTextFromURL(document.sourceUrl);
        break;
        
      case 'text':
      case 'manual':
        if (!document.rawText) {
          throw new Error('Text document missing raw text');
        }
        rawText = document.rawText;
        break;
        
      default:
        throw new Error(`Unknown source type: ${document.sourceType}`);
    }
    
    if (!rawText || rawText.length < 10) {
      throw new Error('Extracted text is too short');
    }
    
    emitProgress(companyId, documentId, 30, 'text_extracted');
    
    // Step 3: Split into chunks
    const chunks = await splitText(rawText);
    
    if (chunks.length === 0) {
      throw new Error('No chunks generated from text');
    }
    
    childLogger.debug({ documentId, chunkCount: chunks.length }, 'Text split into chunks');
    emitProgress(companyId, documentId, 50, 'chunks_created');
    
    // Step 4: Batch embed chunks (20 per batch)
    const embeddings = await batchEmbed(chunks, 20);
    emitProgress(companyId, documentId, 75, 'embeddings_created');
    
    // Step 5: Upsert to Pinecone
    const namespace = `${companyId}:${document.language || 'en'}`;
    const vectors = chunks.map((chunk, index) => ({
      id: `doc-${documentId}-chunk-${index}`,
      values: embeddings[index],
      metadata: {
        documentId,
        title: document.title,
        category: document.category,
        chunk_index: index,
        text: chunk.slice(0, 1000), // Store truncated text for retrieval
      },
    }));
    
    // Upsert in batches of 100
    const UPSERT_BATCH_SIZE = 100;
    for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
      const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
      await pineconeIndex.namespace(namespace).upsert(batch);
      
      const progress = 75 + Math.floor(((i + batch.length) / vectors.length) * 20);
      emitProgress(companyId, documentId, progress, 'upserting');
    }
    
    // Step 6: Update document status
    document.status = 'indexed';
    document.chunkCount = chunks.length;
    document.lastIndexedAt = new Date();
    document.rawText = rawText.slice(0, 10000); // Store truncated for reference
    await document.save();
    
    emitProgress(companyId, documentId, 100, 'indexed');
    
    const durationMs = Date.now() - startTime;
    childLogger.info(
      {
        documentId,
        companyId,
        chunkCount: chunks.length,
        durationMs,
      },
      'KB document indexed successfully'
    );
    
    return {
      chunkCount: chunks.length,
      status: 'indexed',
    };
  } catch (error) {
    // Update document with error
    await KBDocument.updateOne(
      { _id: documentId },
      {
        $set: {
          status: 'failed',
          errorMessage: (error as Error).message,
        },
      }
    );
    
    emitProgress(companyId, documentId, 0, 'failed');
    
    childLogger.error(
      { error, documentId, companyId },
      'KB document indexing failed'
    );
    
    throw error;
  }
}

/**
 * KB Index Worker
 */
export const kbIndexWorker = new Worker<KBIndexJobData>(
  QUEUES.KB_INDEX,
  processKBIndexJob,
  {
    connection: connectionOptions,
    concurrency: 3,
  }
);

// Worker event handlers
kbIndexWorker.on('completed', (job, result) => {
  childLogger.debug(
    { jobId: job.id, result },
    'KB index job completed'
  );
});

kbIndexWorker.on('failed', (job, error) => {
  childLogger.error(
    { jobId: job?.id, error: error.message },
    'KB index job failed'
  );
});

kbIndexWorker.on('error', (error) => {
  childLogger.error({ error: error.message }, 'KB index worker error');
});

export default kbIndexWorker;
