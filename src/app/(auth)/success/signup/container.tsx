const SuccessContainer = ({ email }: { email: string }) => (
    <>
        <h1>Success! 🎉</h1>
        <p>Check your email. A link was sent to <a href={`mailto:${email}`}>{email}</a> to sign in.</p>
    </>
  );

export default SuccessContainer;
