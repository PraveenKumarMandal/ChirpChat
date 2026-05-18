import { Redirect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppAvatar, AppBadge, AppButton, AppCard, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api from '../services/api';

type UserSummary = {
  _id: string;
  name: string;
  username: string;
  email: string;
  profilePicture?: string;
};

export default function BlockFriend() {
  const { currentUser } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [contacts, setContacts] = useState<UserSummary[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<UserSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    try {
      const [homeRes, blockedRes] = await Promise.all([
        api.get(`/home/${currentUser._id}`),
        api.get(`/users/${currentUser._id}/blocked`),
      ]);

      setContacts(homeRes.data.contacts);
      setBlockedUsers(blockedRes.data);
    } catch {
      Alert.alert('Error', 'Could not load block list.');
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  const blockUser = async (targetUserId: string) => {
    try {
      await api.post(`/users/${currentUser._id}/block`, { targetUserId });
      await loadData();
    } catch {
      Alert.alert('Error', 'Could not block this friend.');
    }
  };

  const unblockUser = async (targetUserId: string) => {
    try {
      await api.post(`/users/${currentUser._id}/unblock`, { targetUserId });
      await loadData();
    } catch {
      Alert.alert('Error', 'Could not unblock this user.');
    }
  };

  const refreshLists = async () => {
    try {
      setRefreshing(true);
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AppScreen style={styles.screen}>
      <AppCard>
        <Text style={styles.eyebrow}>Privacy</Text>
        <Text style={styles.title}>Block management</Text>
        <Text style={styles.subtitle}>
          Control who can interact with you. Blocking removes active friendship and stops messaging.
        </Text>
        <View style={styles.badges}>
          <AppBadge text={`${contacts.length} contacts`} />
          <AppBadge text={`${blockedUsers.length} blocked`} tone={blockedUsers.length ? 'danger' : 'neutral'} />
        </View>
      </AppCard>

      <FlatList
        data={[{ key: 'contacts' }, { key: 'blocked' }]}
        keyExtractor={(item) => item.key}
        style={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshLists} tintColor={theme.colors.accent} />}
        renderItem={({ item }) =>
          item.key === 'contacts' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Current contacts</Text>
              {contacts.length ? (
                contacts.map((contact) => (
                  <AppCard key={contact._id} style={styles.userCard}>
                    <View style={styles.userRow}>
                      <AppAvatar uri={contact.profilePicture} name={contact.name} size={60} />
                      <View style={styles.userInfo}>
                        <Text style={styles.name}>{contact.name}</Text>
                        <Text style={styles.meta}>@{contact.username}</Text>
                        <Text style={styles.meta}>{contact.email}</Text>
                      </View>
                    </View>
                    <AppButton variant="danger" onPress={() => blockUser(contact._id)}>
                      Block
                    </AppButton>
                  </AppCard>
                ))
              ) : (
                <AppCard>
                  <Text style={styles.emptyText}>No contacts available yet.</Text>
                </AppCard>
              )}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Blocked users</Text>
              {blockedUsers.length ? (
                blockedUsers.map((user) => (
                  <AppCard key={user._id} style={styles.userCard}>
                    <View style={styles.userRow}>
                      <AppAvatar uri={user.profilePicture} name={user.name} size={60} />
                      <View style={styles.userInfo}>
                        <Text style={styles.name}>{user.name}</Text>
                        <Text style={styles.meta}>@{user.username}</Text>
                        <Text style={styles.meta}>{user.email}</Text>
                      </View>
                    </View>
                    <AppButton variant="secondary" onPress={() => unblockUser(user._id)}>
                      Unblock
                    </AppButton>
                  </AppCard>
                ))
              ) : (
                <AppCard>
                  <Text style={styles.emptyText}>No blocked users.</Text>
                </AppCard>
              )}
            </View>
          )
        }
      />
    </AppScreen>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
    },
    list: {
      flex: 1,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    title: {
      color: theme.colors.text,
      fontSize: 30,
      fontWeight: '800',
      marginTop: 8,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 8,
    },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 14,
    },
    section: {
      gap: 12,
      marginBottom: 18,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    userCard: {
      gap: 14,
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    userInfo: {
      flex: 1,
      gap: 4,
    },
    name: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    meta: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
    },
  });
