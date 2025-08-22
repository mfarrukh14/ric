import React, { useState } from 'react';
import { EyeIcon, EyeOffIcon as EyeSlashIcon, ClipboardIcon, ClipboardCheckIcon } from 'lucide-react';


const UserListModal = ({ show, onClose, title, users, onDelete, onToggleHod, searchTerm, onSearchChange }) => {
    const [showPasswords, setShowPasswords] = useState({});
    const [copiedStates, setCopiedStates] = useState({});

    if (!show) return null;

    const togglePasswordVisibility = (userId) => {
        setShowPasswords(prev => ({
            ...prev,
            [userId]: !prev[userId]
        }));
    };

    const copyToClipboard = async (text, userId) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedStates(prev => ({ ...prev, [userId]: true }));
            setTimeout(() => {
                setCopiedStates(prev => ({ ...prev, [userId]: false }));
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/15 bg-opacity-30 backdrop-filter backdrop-blur-md flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>

                {/* Search */}
                <input
                    type="text"
                    placeholder="Search users..."
                    className="w-full p-2 mb-4 rounded border focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={searchTerm}
                    onChange={onSearchChange}
                />

                {/* Members Table */}
                <div className="overflow-y-auto flex-1">
                    <table className="min-w-full bg-white bg-opacity-30 backdrop-filter backdrop-blur-lg rounded-lg">
                        <thead className="sticky top-0 bg-white">
                            <tr className="border-b border-gray-200">
                                <th className="px-4 py-2 text-left">Name</th>
                                <th className="px-4 py-2 text-left">Designation</th>
                                <th className="px-4 py-2 text-left">Role</th>
                                <th className="px-4 py-2 text-left">Credentials</th>
                                <th className="px-4 py-2 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-4 py-3 text-center">
                                        No matching users found.
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2">
                                            {user.name}
                                            {user.is_hod ? (
                                                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                    HOD
                                                </span>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-2">{user.designation}</td>
                                        <td className="px-4 py-2">
                                            {user.is_hod ? 'Head of Department' : 'User'}
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="space-y-2">
                                                <div className="flex items-center space-x-2">
                                                    <p className="font-mono text-sm">
                                                        <span className="text-gray-600">Username:</span> {user.username}
                                                    </p>
                                                    <button
                                                        onClick={() => copyToClipboard(user.username, `${user.id}-username`)}
                                                        className="p-1 hover:bg-gray-100 rounded"
                                                        title="Copy username"
                                                    >
                                                        {copiedStates[`${user.id}-username`] ? (
                                                            <ClipboardCheckIcon className="h-4 w-4 text-green-600" />
                                                        ) : (
                                                            <ClipboardIcon className="h-4 w-4 text-gray-600" />
                                                        )}
                                                    </button>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <p className="font-mono text-sm">
                                                        <span className="text-gray-600">Password:</span>{' '}
                                                        {showPasswords[user.id] ? user.password : '••••••••'}
                                                    </p>
                                                    <button
                                                        onClick={() => togglePasswordVisibility(user.id)}
                                                        className="p-1 hover:bg-gray-100 rounded"
                                                        title={showPasswords[user.id] ? "Hide password" : "Show password"}
                                                    >                                                        {showPasswords[user.id] ? (
                                                            <EyeSlashIcon className="h-4 w-4 text-gray-600" />
                                                        ) : (
                                                            <EyeIcon className="h-4 w-4 text-gray-600" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => copyToClipboard(user.password, `${user.id}-password`)}
                                                        className="p-1 hover:bg-gray-100 rounded"
                                                        title="Copy password"
                                                    >
                                                        {copiedStates[`${user.id}-password`] ? (
                                                            <ClipboardCheckIcon className="h-4 w-4 text-green-600" />
                                                        ) : (
                                                            <ClipboardIcon className="h-4 w-4 text-gray-600" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <div className="flex space-x-2 justify-center">
                                                {user.department_id && (
                                                    <button
                                                        onClick={() => onToggleHod && onToggleHod(user.id, !user.is_hod)}
                                                        className={`text-xs px-2 py-1 rounded ${
                                                            user.is_hod 
                                                                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
                                                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                                        }`}
                                                        title={user.is_hod ? 'Remove HOD status' : 'Make HOD'}
                                                    >
                                                        {user.is_hod ? 'Remove HOD' : 'Make HOD'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => onDelete('user', user.id)}
                                                    className="text-red-600 hover:text-red-800 text-sm hover:bg-red-50 px-2 py-1 rounded"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UserListModal;
