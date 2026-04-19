/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Separator } from './separator';

const VerticalSeparator = ({ className }: { className?: string }) => {
  return <Separator className={className} orientation="vertical" />;
};

export default VerticalSeparator;
