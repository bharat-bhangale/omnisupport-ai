// ============================================================================
// LANGUAGE API ROUTES
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Pinecone } from '@pinecone-database/pinecone';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { languageDetector, SUPPORTED_LANGUAGES, LANGUAGE_FLAGS } from '../services/languageDetector.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Initialize Pinecone
const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });

// ============================================================================
// GET /languages/supported — List all supported languages
// ============================================================================

router.get('/supported', (_req: Request, res: Response) => {
  const languages = Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
    code,
    name,
    flag: LANGUAGE_FLAGS[code] || '🌐',
  }));

  res.json({
    languages,
    count: languages.length,
  });
});

// ============================================================================
// GET /languages/kb-coverage — KB document count per language
// ============================================================================

router.get('/kb-coverage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const companyId = authReq.user.companyId;

    const index = pinecone.Index(env.PINECONE_INDEX);

    // Get stats for each language namespace
    const coverage: Array<{
      code: string;
      name: string;
      flag: string;
      documentCount: number;
      hasContent: boolean;
    }> = [];

    // Check common languages
    const languagesToCheck = ['en', 'hi', 'es', 'fr', 'de', 'ar', 'zh', 'ja', 'pt', 'ru'];

    for (const code of languagesToCheck) {
      try {
        const namespace = `${companyId}:${code}`;
        const stats = await index.namespace(namespace).describeIndexStats();
        const vectorCount = stats.namespaces?.[namespace]?.recordCount || 0;

        coverage.push({
          code,
          name: SUPPORTED_LANGUAGES[code],
          flag: LANGUAGE_FLAGS[code] || '🌐',
          documentCount: vectorCount,
          hasContent: vectorCount > 0,
        });
      } catch {
        // Namespace doesn't exist or error
        coverage.push({
          code,
          name: SUPPORTED_LANGUAGES[code],
          flag: LANGUAGE_FLAGS[code] || '🌐',
          documentCount: 0,
          hasContent: false,
        });
      }
    }

    // Sort by document count (most content first)
    coverage.sort((a, b) => b.documentCount - a.documentCount);

    res.json({
      coverage,
      totalLanguages: coverage.filter((c) => c.hasContent).length,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /languages/detect — Detect language from text
// ============================================================================

router.post('/detect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const { text } = z.object({ text: z.string().min(1).max(5000) }).parse(req.body);

    const result = await languageDetector.detectLanguageFromText(
      text,
      authReq.user.companyId
    );

    res.json({
      languageCode: result.code,
      languageName: result.name,
      flag: LANGUAGE_FLAGS[result.code] || '🌐',
      confidence: result.confidence,
      isSupported: languageDetector.isSupported(result.code),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /languages/company-config — Get company's language settings
// ============================================================================

router.get('/company-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;

    // Import Company model dynamically to avoid circular deps
    const { Company } = await import('../models/Company.js');

    const company = await Company.findById(authReq.user.companyId).select(
      'primaryLanguage textConfig.supportedLanguages textConfig.autoDetect'
    );

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({
      primaryLanguage: company.primaryLanguage || 'en',
      supportedLanguages: company.textConfig?.supportedLanguages || ['en'],
      autoDetect: company.textConfig?.autoDetect ?? true,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PATCH /languages/company-config — Update company's language settings
// ============================================================================

router.patch('/company-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const { supportedLanguages, autoDetect, primaryLanguage } = z
      .object({
        supportedLanguages: z.array(z.string()).optional(),
        autoDetect: z.boolean().optional(),
        primaryLanguage: z.string().optional(),
      })
      .parse(req.body);

    // Validate language codes
    if (supportedLanguages) {
      const invalid = supportedLanguages.filter((code) => !languageDetector.isSupported(code));
      if (invalid.length > 0) {
        return res.status(400).json({
          error: `Invalid language codes: ${invalid.join(', ')}`,
        });
      }
    }

    if (primaryLanguage && !languageDetector.isSupported(primaryLanguage)) {
      return res.status(400).json({ error: 'Invalid primary language code' });
    }

    const { Company } = await import('../models/Company.js');

    const updateFields: Record<string, unknown> = {};
    if (supportedLanguages !== undefined) {
      updateFields['textConfig.supportedLanguages'] = supportedLanguages;
    }
    if (autoDetect !== undefined) {
      updateFields['textConfig.autoDetect'] = autoDetect;
    }
    if (primaryLanguage !== undefined) {
      updateFields.primaryLanguage = primaryLanguage;
    }

    const company = await Company.findByIdAndUpdate(
      authReq.user.companyId,
      { $set: updateFields },
      { new: true }
    ).select('primaryLanguage textConfig.supportedLanguages textConfig.autoDetect');

    logger.info(
      { companyId: authReq.user.companyId, changes: updateFields },
      'Language config updated'
    );

    res.json({
      primaryLanguage: company?.primaryLanguage || 'en',
      supportedLanguages: company?.textConfig?.supportedLanguages || ['en'],
      autoDetect: company?.textConfig?.autoDetect ?? true,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
