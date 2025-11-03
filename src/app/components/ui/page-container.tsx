const PageContainer = ({ children }: { children: React.ReactNode }) => {
  return <div className="mx-auto w-[calc(100%-theme(spacing.4))]">{children}</div>;
};

export default PageContainer;
