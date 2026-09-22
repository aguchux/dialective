-- AlterTable
ALTER TABLE "stream_api_keys" ADD COLUMN     "purposes" "VdclPurpose"[] DEFAULT ARRAY[]::"VdclPurpose"[];

-- AlterTable
ALTER TABLE "oauth_clients" ADD COLUMN     "purposes" "VdclPurpose"[] DEFAULT ARRAY[]::"VdclPurpose"[];

