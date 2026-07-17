import { redirect } from "next/navigation";

// Company News was merged into the unified Create Post page.
export default function CompanyNewsRedirect() {
  redirect("/create");
}
