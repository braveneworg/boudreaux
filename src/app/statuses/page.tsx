import CDNStatusBanner from '../components/cdn-status-banner';
import DataStoreHealthStatus from '../components/data-store-health-status';

export default function Statuses() {
  return (
    <>
      <DataStoreHealthStatus />
      <CDNStatusBanner />
    </>
  );
}
