import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, tokenStore } from '@/shared/api';
import { fetchCurrentUser, type User } from '@/entities/User';
import {
  login,
  logout,
  logoutAllDevices,
  register,
  type LoginCredentials,
  type RegisterPayload,
} from '../api/authApi';

/** Signs in, then seeds the session cache so no view flashes a loading state. */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginCredentials): Promise<User> => {
      await login(credentials);
      return fetchCurrentUser();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.currentUser(), user);
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    },
    // Credentials are never safe to replay blindly; a failed sign-in should
    // surface immediately rather than retry behind the user's back.
    retry: false,
  });
}

/**
 * Registers and immediately signs in. The service issues no tokens on register,
 * so doing both here keeps the user from having to type their password twice.
 */
export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RegisterPayload): Promise<User> => {
      await register(payload);
      await login({ email: payload.email, password: payload.password });
      return fetchCurrentUser();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.currentUser(), user);
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    },
    retry: false,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  const clearLocalSession = useCallback(() => {
    tokenStore.clear();
    queryClient.setQueryData(queryKeys.currentUser(), null);
    // Drop every cached document so a second account never sees the first's data.
    queryClient.removeQueries({ queryKey: queryKeys.documents });
  }, [queryClient]);

  const single = useMutation({
    mutationFn: logout,
    // The local session is cleared either way — a failed network call must not
    // strand the user in a half-signed-out state.
    onSettled: clearLocalSession,
    retry: false,
  });

  const all = useMutation({
    mutationFn: logoutAllDevices,
    onSettled: clearLocalSession,
    retry: false,
  });

  return { logout: single, logoutAllDevices: all, clearLocalSession };
}
