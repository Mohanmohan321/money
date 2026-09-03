import type {
  AssetRecord,
  CreateAssetInput,
  CreateLiabilityInput,
  LiabilityRecord,
  NetWorthSummary,
  UpdateAssetInput,
  UpdateLiabilityInput,
} from '../../shared/contracts';

export interface NetWorthStore {
  createAsset(input: CreateAssetInput): Promise<AssetRecord>;
  listAssets(): Promise<AssetRecord[]>;
  updateAsset(id: string, input: UpdateAssetInput): Promise<AssetRecord | undefined>;
  deleteAsset(id: string): Promise<boolean>;
  createLiability(input: CreateLiabilityInput): Promise<LiabilityRecord>;
  listLiabilities(): Promise<LiabilityRecord[]>;
  updateLiability(id: string, input: UpdateLiabilityInput): Promise<LiabilityRecord | undefined>;
  deleteLiability(id: string): Promise<boolean>;
  getNetWorth(): Promise<NetWorthSummary>;
}
