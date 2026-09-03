import { Router } from 'express';
import { z } from 'zod';

import {
  createAssetSchema,
  createLiabilitySchema,
  updateAssetSchema,
  updateLiabilitySchema,
} from '../../shared/contracts';
import { AppError } from '../middleware/errors';
import type { NetWorthStore } from './store';

const resourceIdSchema = z.string().uuid('Resource ID must be a UUID');

function assetNotFound(): AppError {
  return new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
}

function liabilityNotFound(): AppError {
  return new AppError(404, 'LIABILITY_NOT_FOUND', 'Liability not found');
}

export function createNetWorthRouter(store: NetWorthStore): Router {
  const router = Router();

  router.post('/assets', async (request, response) => {
    const input = createAssetSchema.parse(request.body);
    response.status(201).json({ success: true, data: await store.createAsset(input) });
  });

  router.get('/assets', async (_request, response) => {
    response.json({ success: true, data: { items: await store.listAssets() } });
  });

  router.put('/assets/:id', async (request, response) => {
    const id = resourceIdSchema.parse(request.params.id);
    const input = updateAssetSchema.parse(request.body);
    const asset = await store.updateAsset(id, input);
    if (!asset) throw assetNotFound();
    response.json({ success: true, data: asset });
  });

  router.delete('/assets/:id', async (request, response) => {
    const id = resourceIdSchema.parse(request.params.id);
    if (!(await store.deleteAsset(id))) throw assetNotFound();
    response.json({ success: true, data: { deleted: true } });
  });

  router.post('/liabilities', async (request, response) => {
    const input = createLiabilitySchema.parse(request.body);
    response.status(201).json({ success: true, data: await store.createLiability(input) });
  });

  router.get('/liabilities', async (_request, response) => {
    response.json({ success: true, data: { items: await store.listLiabilities() } });
  });

  router.put('/liabilities/:id', async (request, response) => {
    const id = resourceIdSchema.parse(request.params.id);
    const input = updateLiabilitySchema.parse(request.body);
    const liability = await store.updateLiability(id, input);
    if (!liability) throw liabilityNotFound();
    response.json({ success: true, data: liability });
  });

  router.delete('/liabilities/:id', async (request, response) => {
    const id = resourceIdSchema.parse(request.params.id);
    if (!(await store.deleteLiability(id))) throw liabilityNotFound();
    response.json({ success: true, data: { deleted: true } });
  });

  router.get('/net-worth', async (_request, response) => {
    response.json({ success: true, data: await store.getNetWorth() });
  });

  return router;
}
