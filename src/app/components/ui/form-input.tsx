import { Input } from "./input";

interface FormInputProperties {
  id: string;
  placeholder: string;
  type: string;
  value: string;
}

const FormInput = ({ id, placeholder, type, ...properties }: FormInputProperties) => (
    <Input
      className="h-12 text-lg"
      id={id}
      placeholder={placeholder}
      type={type}
      {...properties}
    />
  );

export default FormInput;
