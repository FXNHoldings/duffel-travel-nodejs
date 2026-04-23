import type { NextPageContext } from "next";

type ErrorPageProps = {
  statusCode?: number;
};

function ErrorPage({ statusCode }: ErrorPageProps) {
  return (
    <main style={{ fontFamily: "Outfit, sans-serif", padding: "40px" }}>
      <h1 style={{ fontWeight: 600, marginBottom: "12px" }}>Something went wrong</h1>
      <p>
        {statusCode ? `A ${statusCode} error occurred.` : "An unexpected client error occurred."}
      </p>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};

export default ErrorPage;
