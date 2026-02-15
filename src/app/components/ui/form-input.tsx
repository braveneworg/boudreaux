/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Input } from './input';

interface FormInputProperties {
  id: string;
  placeholder: string;
  type: string;
  value: string;
  autoFocus?: boolean;
}

const FormInput = ({ id, placeholder, type, autoFocus, ...properties }: FormInputProperties) => (
  <Input
    className="h-12 text-lg"
    id={id}
    placeholder={placeholder}
    type={type}
    autoFocus={autoFocus}
    {...properties}
  />
);

export default FormInput;
