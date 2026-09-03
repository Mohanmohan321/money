import { Router } from 'express';
import { z } from 'zod';

import {
  createVaultContributionSchema,
  createVaultSchema,
} from '../../shared/contracts';
import { AppError } from '../middleware/errors';
import type { VaultStore } from './store';

const vaultIdSchema = z.string().uuid('Vault ID must be a UUID');

function vaultNotFound(): AppError {
  return new AppError(404, 'VAULT_NOT_FOUND', 'Vault not found');
}

export function createVaultRouter(store: VaultStore): Router {
  const router = Router();

  router.post('/vaults', async (request, response) => {
    const input = createVaultSchema.parse(request.body);
    response.status(201).json({ success: true, data: await store.createVault(input) });
  });

  router.get('/vaults', async (_request, response) => {
    response.json({ success: true, data: { items: await store.listVaults() } });
  });

  router.get('/vaults/:id', async (request, response) => {
    const id = vaultIdSchema.parse(request.params.id);
    const vault = await store.getVault(id);
    if (!vault) throw vaultNotFound();
    response.json({ success: true, data: vault });
  });

  router.post('/vaults/:id/contributions', async (request, response) => {
    const id = vaultIdSchema.parse(request.params.id);
    const input = createVaultContributionSchema.parse(request.body);
    const result = await store.createContribution(id, input);
    if (result.outcome === 'not_found') throw vaultNotFound();
    if (result.outcome === 'archived') {
      throw new AppError(409, 'VAULT_ARCHIVED', 'Archived Vaults cannot receive contributions');
    }
    response.status(201).json({ success: true, data: result.contribution });
  });

  router.post('/vaults/:id/archive', async (request, response) => {
    const id = vaultIdSchema.parse(request.params.id);
    const vault = await store.archiveVault(id);
    if (!vault) throw vaultNotFound();
    response.json({ success: true, data: vault });
  });

  router.delete('/vaults/:id', async (request, response) => {
    const id = vaultIdSchema.parse(request.params.id);
    const result = await store.deleteVault(id);
    if (result === 'not_found') throw vaultNotFound();
    if (result === 'has_contributions') {
      throw new AppError(
        409,
        'VAULT_HAS_CONTRIBUTIONS',
        'Vaults with contributions must be archived instead of deleted',
      );
    }
    response.json({ success: true, data: { deleted: true } });
  });

  return router;
}
