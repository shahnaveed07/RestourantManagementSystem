import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, KeyRound, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { formatDateTime, ROLE_LABELS } from '../utils/format';
import { useModalA11y } from '../utils/useModalA11y';

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
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [busyUserId, setBusyUserId] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [resetError, setResetError] = useState(null);

  const createModalRef = useModalA11y(createOpen, () => setCreateOpen(false));
  const resetModalRef = useModalA11y(Boolean(resetUser), () => setResetUser(null));

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
    setCreateError(null);
    setCreating(true);
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
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (u) => {
    setBusyUserId(u.id);
    try {
      const updated = await api.updateStaff(u.id, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`${updated.name} is now ${updated.isActive ? 'Active' : 'Deactivated'}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRoleChange = async (u, role) => {
    setBusyUserId(u.id);
    try {
      const updated = await api.updateStaff(u.id, { role });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`Updated ${updated.name}'s role to ${ROLE_LABELS[role]}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetUser) return;
    setResetError(null);
    setResetting(true);
    try {
      await api.resetStaffPassword(resetUser.id, resetPassword);
      toast.success(`Password reset for ${resetUser.name}`);
      setResetUser(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <Layout
      title="Staff Accounts & Audit Trail"
      subtitle="Administer role permissions, deactivate accounts, reset passwords, and inspect activity logs"
      actions={
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap"
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

          {/* Mobile Card List (< md) */}
          <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading staff...</div>
            ) : (
              users.map((u) => (
                <article key={u.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{u.name}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Last login: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyUserId === u.id}
                      onClick={() => handleToggleActive(u)}
                      className={`min-h-[44px] px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 disabled:opacity-60 ${
                        u.isActive !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-slate-100 border-slate-300 text-slate-500'
                      }`}
                    >
                      {u.isActive !== false ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <select
                      aria-label={`Role for ${u.name}`}
                      disabled={busyUserId === u.id}
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                      className="min-h-[44px] flex-1 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-base sm:text-xs font-semibold text-slate-800 disabled:opacity-60"
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="waiter">Waiter</option>
                      <option value="kitchen">Kitchen</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setResetError(null);
                        setResetUser(u);
                      }}
                      className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Reset PW
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
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
                          disabled={busyUserId === u.id}
                          value={u.role}
                          onChange={(e) => handleRoleChange(u, e.target.value)}
                          className="min-h-[44px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 disabled:opacity-60"
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
                          disabled={busyUserId === u.id}
                          onClick={() => handleToggleActive(u)}
                          className={`min-h-[44px] px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-60 ${
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
                          onClick={() => {
                            setResetError(null);
                            setResetUser(u);
                          }}
                          className="min-h-[44px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
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

          <div className="md:hidden divide-y divide-slate-100 text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-teal-800">{log.action}</span>
                  <span className="font-mono text-[11px] text-slate-500 shrink-0">
                    {formatDateTime(log.timestamp)}
                  </span>
                </div>
                <p className="font-medium text-slate-900">
                  {log.actorName} ({log.actorRole})
                </p>
                <p className="text-slate-600">{log.details}</p>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
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
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-staff-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <form
            ref={createModalRef}
            onSubmit={handleCreate}
            className="bg-white sm:border border-slate-200 sm:rounded-xl w-full h-dvh sm:h-auto sm:max-w-md p-6 space-y-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close modal"
                className="sm:order-last min-w-[44px] min-h-[44px] p-2 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 id="create-staff-title" className="text-base font-bold text-slate-900">Create Staff Account</h2>
            </div>
            {createError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
              >
                {createError}
              </div>
            )}
            <div>
              <label htmlFor="st-name" className="block text-xs font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="st-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
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
                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="st-role" className="block text-xs font-medium text-slate-700 mb-1">
                  Role
                </label>
                <select
                  id="st-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm bg-white"
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
                  className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create Staff'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-pw-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResetUser(null);
          }}
        >
          <form
            ref={resetModalRef}
            onSubmit={handleResetPassword}
            className="bg-white sm:border border-slate-200 sm:rounded-xl w-full h-dvh sm:h-auto sm:max-w-sm p-6 space-y-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setResetUser(null)}
                aria-label="Close password modal"
                className="sm:order-last min-w-[44px] min-h-[44px] p-2 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 id="reset-pw-title" className="text-base font-bold text-slate-900">
                Reset Password — {resetUser.name}
              </h2>
            </div>
            {resetError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
              >
                {resetError}
              </div>
            )}
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
                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetting}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {resetting ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}
