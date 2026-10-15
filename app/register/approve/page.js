import ApprovalClient from "./ApprovalClient";

export const metadata = {
  title: "Approve employee registration | RailwayMitra",
};

export default async function RegistrationApprovalPage({ searchParams }) {
  const params = await searchParams;
  const token = typeof params?.token === "string" ? params.token : "";
  return <ApprovalClient token={token} />;
}
