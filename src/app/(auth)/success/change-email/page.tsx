/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import SuccessContainer from './container';

const SuccessPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) => {
  const email = await searchParams.then((params) => params.email);

  if (!email || Array.isArray(email)) {
    throw Error('A single email query string parameter is required');
  }

  return <SuccessContainer email={email} />;
};

export default SuccessPage;
