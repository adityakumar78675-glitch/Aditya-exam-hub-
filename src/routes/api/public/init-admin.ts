import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_EMAIL = "admin@adityaexamhub.com";
const ADMIN_PASSWORD = "Admin@123";

export const Route = createFileRoute("/api/public/init-admin")({
  server: {
    handlers: {
      POST: async () => {
        try {
          // Look up existing user by email via listing (admin API has no direct getByEmail)
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          let admin = list?.users.find((u) => u.email === ADMIN_EMAIL);

          if (!admin) {
            const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
              email: ADMIN_EMAIL,
              password: ADMIN_PASSWORD,
              email_confirm: true,
              user_metadata: { full_name: "Aditya Admin" },
            });
            if (error) throw error;
            admin = created.user!;
          }

          // Ensure admin role exists
          const { data: existing } = await supabaseAdmin
            .from("user_roles")
            .select("id")
            .eq("user_id", admin.id)
            .eq("role", "admin")
            .maybeSingle();

          if (!existing) {
            await supabaseAdmin.from("user_roles").insert({ user_id: admin.id, role: "admin" });
          }

          // Ensure profile exists
          await supabaseAdmin.from("profiles").upsert({
            id: admin.id,
            full_name: "Aditya Admin",
          }, { onConflict: "id" });

          return Response.json({ ok: true });
        } catch (e) {
          console.error("init-admin error", e);
          return new Response(JSON.stringify({ ok: false }), { status: 200 });
        }
      },
    },
  },
});
