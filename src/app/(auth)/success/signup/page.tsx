import SuccessContainer from './container';

const SuccessPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) => {
  const { email } = await searchParams;

  return (
    <SuccessContainer email={(email as string).replace(' ', '+')} />
  );
};

export default SuccessPage;
