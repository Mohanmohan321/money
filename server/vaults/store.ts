import type {
  CreateVaultContributionInput,
  CreateVaultInput,
  Vault,
  VaultContribution,
} from '../../shared/contracts';

export type ContributionResult =
  | { outcome: 'created'; contribution: VaultContribution }
  | { outcome: 'not_found' }
  | { outcome: 'archived' };

export type DeleteVaultResult = 'deleted' | 'not_found' | 'has_contributions';

export interface VaultStore {
  listVaults(): Promise<Vault[]>;
  createVault(input: CreateVaultInput): Promise<Vault>;
  getVault(id: string): Promise<Vault | undefined>;
  createContribution(
    vaultId: string,
    input: CreateVaultContributionInput,
  ): Promise<ContributionResult>;
  archiveVault(id: string): Promise<Vault | undefined>;
  deleteVault(id: string): Promise<DeleteVaultResult>;
}
