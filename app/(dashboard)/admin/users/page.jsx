"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  // Redirect non-admins
  useEffect(() => {
    if (session && session.user.role !== "admin") {
      router.push("/dashboard");
    }
  }, [session, router]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateUserStatus = async (userId, status) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error updating user:", error);
    }
    setActionLoading(null);
  };

  const statusColors = {
    pending: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    approved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    rejected: "bg-red-500/15 text-red-500 border-red-500/30",
  };

  if (session?.user?.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Approve or reject user registrations
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">
            No registered users yet
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Registered</th>
                <th className="text-right px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">{user.name || "—"}</td>
                  <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-mono font-semibold border ${statusColors[user.status] || statusColors.pending}`}>
                      {user.status?.toUpperCase() || "PENDING"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{user.role || "user"}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {user.status !== "approved" && (
                        <button
                          onClick={() => updateUserStatus(user.id, "approved")}
                          disabled={actionLoading === user.id}
                          className="px-3 py-1.5 bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 rounded-lg text-xs font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {user.status !== "rejected" && user.role !== "admin" && (
                        <button
                          onClick={() => updateUserStatus(user.id, "rejected")}
                          disabled={actionLoading === user.id}
                          className="px-3 py-1.5 bg-red-500/15 text-red-500 border border-red-500/30 rounded-lg text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
