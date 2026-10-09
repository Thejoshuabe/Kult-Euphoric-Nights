import { getRegistrationStatus, storageError } from "@/lib/kult-server";

export async function GET() {
  try {
    return Response.json(await getRegistrationStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return storageError(error);
  }
}
