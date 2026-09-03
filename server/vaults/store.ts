import type {
  CreateVaultContributionInput,
  CreateVaultInput,
  UpdateVaultInput,
  Vault,
  VaultContribution,
} from '../../shared/contracts';

export type ContributionResult =
  | { outcome: 'created'; contribution: VaultContribution }
  | { outcome: 'not_found' }
  | { outcome: 'archived' };

export type DeleteVaultResult = 'deleted' | 'not_found' | 'has_contributions';

export type UpdateVaultResult =
  | { outcome: 'updated'; vault: Vault }
  | { outcome: 'not_found' }
  | { outcome: 'general_protected' };

export type ArchiveVaultResult =
  | { outcome: 'archived'; vault: Vault }
  | { outcome: 'not_found' }
  | { outcome: 'general_protected' };

export interface VaultStore {
  listVaults(): Promise<Vault[]>;
  createVault(input: CreateVaultInput): Promise<Vault>;
  getVault(id: string): Promise<Vault | undefined>;
  updateVault(id: string, input: UpdateVaultInput): Promise<UpdateVaultResult>;
  createContribution(
    vaultId: string,
    input: CreateVaultContributionInput,
  ): Promise<ContributionResult>;
  archiveVault(id: string): Promise<ArchiveVaultResult>;
  deleteVault(id: string): Promise<DeleteVaultResult | 'general_protected'>;
}
