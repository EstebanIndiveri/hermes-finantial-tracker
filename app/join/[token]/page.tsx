import JoinClient from "./JoinClient";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  return <JoinClient token={token} />;
}
