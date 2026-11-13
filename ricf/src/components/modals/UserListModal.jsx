import { useState } from 'react';
import { ArrowCounterClockwise, Check, Copy, Eye, EyeSlash, Trash } from '@phosphor-icons/react';
import { Badge, Button, Modal } from '../../ui';

export function CopyButton({ text, label, getText }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        const value = getText ? await getText() : text;
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked (e.g. plain http); the text can still be selected by hand.
        }
    };
    return (
        <Button size="sm" variant="ghost" icon={copied ? <Check size={14} /> : <Copy size={14} />} aria-label={label} title={label} onClick={copy} />
    );
}

/** Members of one department or committee, with their sign-in details. */
export default function UserListModal({ show, onClose, title, users, searchTerm, onSearchChange, onDelete, onToggleHod, onToggleEproc, onRevealPassword, onResetPassword }) {
    // Passwords fetched while the dialog is open (null = none stored); dropped on close.
    const [passwords, setPasswords] = useState({});
    const [visible, setVisible] = useState({});

    const close = () => {
        setPasswords({});
        setVisible({});
        onClose();
    };

    const passwordFor = async (user) => {
        if (user.id in passwords) return passwords[user.id];
        const password = await onRevealPassword(user);
        if (password !== undefined) setPasswords((p) => ({ ...p, [user.id]: password }));
        return password;
    };

    const toggle = async (user) => {
        if (!visible[user.id]) await passwordFor(user);
        setVisible((v) => ({ ...v, [user.id]: !v[user.id] }));
    };

    const reset = async (user) => {
        const credentials = await onResetPassword(user);
        if (!credentials) return;
        setPasswords((p) => ({ ...p, [user.id]: credentials.password }));
        setVisible((v) => ({ ...v, [user.id]: true }));
    };

    const shownPassword = (user) => {
        if (!visible[user.id]) return '••••••••';
        return passwords[user.id] ?? <span className="admin-muted" title="Not stored for this account. Reset it to set one.">not stored</span>;
    };

    return (
        <Modal show={show} onClose={close} title={title} size="xl">
            <div className="admin-members">
                <input type="search" className="ui-input" placeholder="Search" aria-label="Search members" value={searchTerm} onChange={onSearchChange} />

                <div className="admin-members__table">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Password</th>
                                <th>Access</th>
                                <th className="admin-table__actions"><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr><td colSpan="5" className="admin-table__empty">No members</td></tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <span className="admin-table__name">{user.name}</span> {user.is_hod ? <Badge tone="warning">HOD</Badge> : null}
                                            <div className="admin-muted">{user.designation}</div>
                                        </td>
                                        <td className="admin-nowrap">
                                            <code className="admin-code">{user.username}</code>
                                            <CopyButton text={user.username} label="Copy username" />
                                        </td>
                                        <td className="admin-nowrap">
                                            <code className="admin-code admin-password">{shownPassword(user)}</code>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                icon={visible[user.id] ? <EyeSlash size={14} /> : <Eye size={14} />}
                                                aria-label={visible[user.id] ? 'Hide password' : 'Show password'}
                                                title={visible[user.id] ? 'Hide password' : 'Show password'}
                                                onClick={() => toggle(user)}
                                            />
                                            <CopyButton getText={() => passwordFor(user)} label="Copy password" />
                                            <Button size="sm" variant="ghost" icon={<ArrowCounterClockwise size={14} />} aria-label="Reset password" title="Reset password" onClick={() => reset(user)} />
                                        </td>
                                        <td>{user.is_finance_user ? 'Finance only' : 'eProcurement'}</td>
                                        <td className="admin-table__actions">
                                            {user.department_id && (
                                                <Button size="sm" variant="ghost" onClick={() => onToggleHod(user.id, !user.is_hod)}>
                                                    {user.is_hod ? 'Remove HOD' : 'Make HOD'}
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={() => onToggleEproc(user.id, !!user.is_finance_user)}>
                                                {user.is_finance_user ? 'Allow eProcurement' : 'Make Finance only'}
                                            </Button>
                                            <Button size="sm" variant="ghost" className="admin-danger" icon={<Trash size={16} />} aria-label="Remove user" title="Remove user" onClick={() => onDelete('user', user.id, user.name)} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
}
