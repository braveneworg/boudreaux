import { email } from 'node_modules/zod/v4/classic/external.cjs';
import SuccessContainer from './container';

const SuccessPage = async ({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) => {
  const email = await searchParams.then(params => params.email);

  if (!email || Array.isArray(email)) {
    throw Error('A single email query string parameter is required');
  }

  return (
    <SuccessContainer email={email} />
  );
};

export default SuccessPage;
