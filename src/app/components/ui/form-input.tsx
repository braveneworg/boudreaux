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
