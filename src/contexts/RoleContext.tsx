import React, { createContext, useContext, useState } from 'react';

export type UserRole = 'OPERATOR' | 'ADMINISTRATOR' | 'DEVELOPER';

interface RoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  isOperator: boolean;
  isAdmin: boolean;
  isDeveloper: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRoleState] = useState<UserRole>(() => {
    const saved = localStorage.getItem('user-role');
    return (saved as UserRole) || 'OPERATOR';
  });

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('user-role', newRole);
  };

  const isOperator = role === 'OPERATOR';
  const isAdmin = role === 'ADMINISTRATOR' || role === 'DEVELOPER';
  const isDeveloper = role === 'DEVELOPER';

  return (
    <RoleContext.Provider value={{ role, setRole, isOperator, isAdmin, isDeveloper }}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};
