import { redirect } from "next/navigation";

export default function ProtectedHome() {
  redirect("/home/today");
}
