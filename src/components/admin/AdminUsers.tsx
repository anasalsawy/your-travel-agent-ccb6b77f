import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, UserPlus, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

type UserWithRole = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  user_id: string;
};

export function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "admin">("staff");
  const [inviting, setInviting] = useState(false);

  const fetchUsers = async () => {
    try {
      // Fetch all user roles with profile info
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("id, user_id, role");

      if (rolesError) throw rolesError;

      // Fetch profiles for these users
      const userIds = roles?.map(r => r.user_id) || [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      // Combine the data
      const usersWithRoles: UserWithRole[] = (roles || []).map(role => {
        const profile = profiles?.find(p => p.id === role.user_id);
        return {
          id: role.id,
          user_id: role.user_id,
          email: profile?.email || "Unknown",
          full_name: profile?.full_name,
          role: role.role,
        };
      });

      // Filter to only show staff and admin users
      const staffAndAdmins = usersWithRoles.filter(u => u.role === "staff" || u.role === "admin");
      setUsers(staffAndAdmins);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    setInviting(true);
    try {
      // First check if user exists in profiles
      const { data: existingProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("email", inviteEmail.trim().toLowerCase())
        .maybeSingle();

      if (profileError) throw profileError;

      if (!existingProfile) {
        toast.error("User not found. They must sign up first before being assigned a role.");
        setInviting(false);
        return;
      }

      // Check if user already has this role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", existingProfile.id)
        .eq("role", inviteRole)
        .maybeSingle();

      if (existingRole) {
        toast.error(`User already has the ${inviteRole} role`);
        setInviting(false);
        return;
      }

      // Add the role
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({
          user_id: existingProfile.id,
          role: inviteRole,
        });

      if (insertError) throw insertError;

      toast.success(`Successfully assigned ${inviteRole} role to ${inviteEmail}`);
      setInviteEmail("");
      fetchUsers();
    } catch (error: any) {
      console.error("Error inviting user:", error);
      toast.error(error.message || "Failed to assign role");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveRole = async (roleId: string, email: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      toast.success(`Role removed from ${email}`);
      fetchUsers();
    } catch (error: any) {
      console.error("Error removing role:", error);
      toast.error(error.message || "Failed to remove role");
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "staff":
        return "default";
      default:
        return "secondary";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite User Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Assign Role to User
          </CardTitle>
          <CardDescription>
            Add staff or admin privileges to existing users. Users must sign up first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="email">User Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <Label htmlFor="role">Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "staff" | "admin")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleInviteUser} disabled={inviting} className="w-full sm:w-auto">
                {inviting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-2" />
                )}
                Assign Role
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Staff & Admin Users
          </CardTitle>
          <CardDescription>
            Manage users with elevated privileges
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No staff or admin users found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name || "—"}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Role</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove the {user.role} role from {user.email}? 
                              They will lose access to admin features.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveRole(user.id, user.email)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove Role
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Admin (Full Access)</h4>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Full access to all features</li>
              <li>Manage users and roles</li>
              <li>View and edit payment settings</li>
              <li>Approve/reject payments and issue refunds</li>
              <li>Access security and authentication settings</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Staff (Operations)</h4>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Create, edit, publish, unpublish, and delete vouchers</li>
              <li>View orders and ticket requests</li>
              <li>Fulfill orders (upload voucher codes or ticket confirmations)</li>
              <li>Mark orders and ticket requests as delivered/completed</li>
              <li>Message customers</li>
              <li>Generate and copy Facebook post text</li>
            </ul>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <h4 className="font-semibold text-sm mb-1">Staff Restrictions</h4>
            <p className="text-sm text-muted-foreground">
              Staff cannot access Settings, payment accounts (Zelle, BTC, Stripe), 
              approve/reject payments, issue refunds, or manage users.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
