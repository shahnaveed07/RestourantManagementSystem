import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, KeyRound, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { formatDateTime, ROLE_LABELS } from '../utils/format';

export function StaffPage() {
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('waiter');

  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');

  const fetchStaff = useCallback(async () => {
    try {
      const data = await api.listStaff();
      setUsers(data.users);
      setAuditLogs(data.auditLogs);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const created = await api.createStaff({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      setUsers((prev) => [...prev, created]);
      setCreateOpen(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      toast.success(`Created account for ${created.name}`);
      fetchStaff();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleActive = async (u) => {
    try {
      const updated = await api.updateStaff(u.id, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`${updated.name} is now ${updated.isActive ? 'Active' : 'Deactivated'}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRoleChange = async (u, role) => {
    try {
      const updated = await api.updateStaff(u.id, { role });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`Updated ${updated.name}'s role to ${ROLE_LABELS[role]}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetUser) return;
    try {
      await api.resetStaffPassword(resetUser.id, resetPassword);
      toast.success(`Password reset for ${resetUser.name}`);
      setResetUser(null);
      setResetPassword('');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Layout
      title="Staff Accounts & Audit Trail"
      subtitle="Administer role permissions, deactivate accounts, reset passwords, and inspect activity logs"
      actions={
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Staff Member
        </button>
      }
    >
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Team Directory ({users.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      Loading staff...
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          aria-label={`Role for ${u.name}`}
                          value={u.role}
                          onChange={(e) => handleRoleChange(u, e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="waiter">Waiter</option>
                          <option value="kitchen">Kitchen</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                            u.isActive !== false
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-slate-100 border-slate-300 text-slate-500'
                          }`}
                        >
                          {u.isActive !== false ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-500">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setResetUser(u)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Reset Password
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit Log */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Recent Audit Log</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Actor</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {log.actorName} ({log.actorRole})
                    </td>
                    <td className="py-2.5 px-4 font-mono text-teal-800 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Staff Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreate}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Create Staff Account</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label htmlFor="st-name" className="block text-xs font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="st-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="st-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                id="st-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="st-role" className="block text-xs font-medium text-slate-700 mb-1">
                  Role
                </label>
                <select
                  id="st-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="waiter">Waiter</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label htmlFor="st-pass" className="block text-xs font-medium text-slate-700 mb-1">
                  Initial Password
                </label>
                <input
                  id="st-pass"
                  type="password"
                  minLength={6}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold"
              >
                Create Staff
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleResetPassword}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Reset Password — {resetUser.name}
              </h2>
              <button
                type="button"
                onClick={() => setResetUser(null)}
                aria-label="Close password modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label htmlFor="new-pw" className="block text-xs font-medium text-slate-700 mb-1">
                New Password (min 6 characters)
              </label>
              <input
                id="new-pw"
                type="password"
                minLength={6}
                required
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}
