import { Link } from 'lucide-react';

const SuccessContainer = () => (
    <>
        <h1>Success! 🎉</h1>
        <p>You have been successfully signed out. Please close your browser to protect your privacy. <Link href="/signin">Return to signin.</Link></p>
    </>
  );

export default SuccessContainer;
