import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAvatar, AppBadge, AppButton, AppCard, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api from '../services/api';
import socket from '../services/socket';

type Contact = {
  _id: string;
  name: string;
  email: string;
  username: string;
  profilePicture?: string;
  isOnline?: boolean;
  lastSeen?: string;
  unreadCount?: number;
  lastMessage: {
    text: string;
    time: string;
    sender: string;
    status?: 'sent' | 'delivered' | 'read';
    messageType?: 'text' | 'image' | 'file';
  } | null;
};

type PendingRequest = {
  _id: string;
  from: {
    _id: string;
    name: string;
    username: string;
    email: string;
    profilePicture?: string;
  };
};

const formatPresence = (contact: Contact) => {
  if (contact.isOnline) {
    return 'Online now';
  }

  if (!contact.lastSeen) {
    return `@${contact.username}`;
  }

  return `Last seen ${new Date(contact.lastSeen).toLocaleString()}`;
};

const formatLastMessageTime = (value?: string) => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function Home() {
  const { currentUser, signOut, updateCurrentUser } = useAuth();
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileModalUser, setProfileModalUser] = useState<Contact | PendingRequest['from'] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const loadHomeData = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    try {
      const response = await api.get(`/home/${currentUser._id}`);
      setContacts(response.data.contacts);
      setPendingRequests(response.data.pendingRequests);
      await updateCurrentUser(response.data.currentUser);
    } catch (error) {
      console.log('Home load error:', error);
    }
  }, [currentUser, updateCurrentUser]);

  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [loadHomeData])
  );

  useEffect(() => {
    const handlePresence = (update: { userId: string; isOnline: boolean; lastSeen: string }) => {
      setContacts((prev) =>
        prev.map((contact) =>
          contact._id === update.userId
            ? { ...contact, isOnline: update.isOnline, lastSeen: update.lastSeen }
            : contact
        )
      );
    };

    const handleRefresh = () => {
      loadHomeData();
    };

    socket.on('presenceUpdate', handlePresence);
    socket.on('receiveMessage', handleRefresh);
    socket.on('messageStatusUpdate', handleRefresh);

    return () => {
      socket.off('presenceUpdate', handlePresence);
      socket.off('receiveMessage', handleRefresh);
      socket.off('messageStatusUpdate', handleRefresh);
    };
  }, [loadHomeData]);

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  const refreshHome = async () => {
    try {
      setRefreshing(true);
      await loadHomeData();
    } finally {
      setRefreshing(false);
    }
  };

  const acceptRequest = async (requestId: string) => {
    await api.post(`/friend-requests/${requestId}/accept`);
    await loadHomeData();
  };

  const rejectRequest = async (requestId: string) => {
    await api.post(`/friend-requests/${requestId}/reject`);
    await loadHomeData();
  };

  const logout = async () => {
    try {
      setLoggingOut(true);
      setMenuOpen(false);
      await signOut();
      router.replace('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const openChat = (contact: Contact) => {
    router.push({
      pathname: '/chat',
      params: {
        user: contact._id,
        chatUserName: contact.name,
      },
    });
  };

  return (
    <AppScreen style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Inbox</Text>
          <Text style={styles.heading}>Chats</Text>
          <Text style={styles.subheading}>Welcome back, {currentUser.name}</Text>
        </View>
        <TouchableOpacity style={styles.menuButton} onPress={() => setMenuOpen(true)}>
          <Ionicons name="grid-outline" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <AppCard style={styles.meCard}>
        <View style={styles.meRow}>
          <AppAvatar uri={currentUser.profilePicture} name={currentUser.name} size={70} />
          <View style={styles.meCopy}>
            <Text style={styles.meName}>{currentUser.name}</Text>
            <Text style={styles.meMeta}>@{currentUser.username}</Text>
            <Text style={styles.meMeta}>{currentUser.email}</Text>
          </View>
        </View>
        <View style={styles.badgeRow}>
          <AppBadge text={`${contacts.length} chats`} />
          <AppBadge text={`${pendingRequests.length} requests`} tone={pendingRequests.length ? 'warning' : 'neutral'} />
        </View>
      </AppCard>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + 132, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshHome} tintColor={theme.colors.accent} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.chatCard} onPress={() => openChat(item)} activeOpacity={0.9}>
            <TouchableOpacity onPress={() => setProfileModalUser(item)} activeOpacity={0.9}>
              <AppAvatar uri={item.profilePicture} name={item.name} size={64} />
            </TouchableOpacity>
            <View style={styles.chatInfo}>
              <View style={styles.chatHeader}>
                <Text style={styles.chatName}>{item.name}</Text>
                <Text style={styles.chatTime}>{formatLastMessageTime(item.lastMessage?.time)}</Text>
              </View>
              <Text style={styles.chatMeta}>{formatPresence(item)}</Text>
              <View style={styles.chatFooter}>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {item.lastMessage?.text || 'Say hello to start chatting'}
                </Text>
                {item.unreadCount ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListHeaderComponent={
          pendingRequests.length ? (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionTitle}>Friend requests</Text>
              {pendingRequests.map((request) => (
                <AppCard key={request._id} style={styles.requestCard}>
                  <TouchableOpacity
                    style={styles.requestUserRow}
                    onPress={() => setProfileModalUser(request.from)}
                    activeOpacity={0.9}
                  >
                    <AppAvatar uri={request.from.profilePicture} name={request.from.name} size={58} />
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>{request.from.name}</Text>
                      <Text style={styles.requestMeta}>@{request.from.username}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.requestActions}>
                    <AppButton variant="secondary" onPress={() => rejectRequest(request._id)}>
                      Reject
                    </AppButton>
                    <AppButton onPress={() => acceptRequest(request._id)}>Accept</AppButton>
                  </View>
                </AppCard>
              ))}
            </View>
          ) : (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionTitle}>Recent conversations</Text>
            </View>
          )
        }
        ListEmptyComponent={
          <AppCard>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyText}>
              Use Find New Friends to send requests and start building your chat list.
            </Text>
          </AppCard>
        }
      />

      <View style={[styles.floatingActions, { bottom: insets.bottom + 12 }]}>
        <AppButton onPress={() => router.push('/users')} leftIcon="people-outline" style={styles.floatingButton}>
          Find New Friends
        </AppButton>
      </View>

      <Modal visible={menuOpen} animationType="fade" transparent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <AppButton variant="secondary" onPress={() => { setMenuOpen(false); router.push('/settings'); }} leftIcon="settings-outline">
              Settings
            </AppButton>
            <AppButton variant="secondary" onPress={() => { setMenuOpen(false); router.push('/block-friend'); }} leftIcon="ban-outline">
              Block friend
            </AppButton>
            <AppButton variant="danger" onPress={logout} disabled={loggingOut} leftIcon="log-out-outline">
              {loggingOut ? 'Logging out...' : 'Log out'}
            </AppButton>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(profileModalUser)}
        animationType="fade"
        transparent
        onRequestClose={() => setProfileModalUser(null)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => setProfileModalUser(null)}>
          <View style={styles.profileModal}>
            <AppAvatar uri={profileModalUser?.profilePicture} name={profileModalUser?.name} size={124} />
            <Text style={styles.profileName}>{profileModalUser?.name}</Text>
            {'username' in (profileModalUser || {}) ? (
              <Text style={styles.profileMeta}>@{profileModalUser?.username}</Text>
            ) : null}
            {'email' in (profileModalUser || {}) ? (
              <Text style={styles.profileMeta}>{profileModalUser?.email}</Text>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    headerCopy: {
      gap: 4,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    heading: {
      color: theme.colors.text,
      fontSize: 34,
      fontWeight: '800',
    },
    subheading: {
      color: theme.colors.textMuted,
      fontSize: 15,
    },
    menuButton: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceRaised,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    meCard: {
      gap: 16,
    },
    meRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    meCopy: {
      flex: 1,
      gap: 5,
    },
    meName: {
      color: theme.colors.text,
      fontSize: 23,
      fontWeight: '800',
    },
    meMeta: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    list: {
      flex: 1,
    },
    requestsSection: {
      gap: 12,
      paddingBottom: 12,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    requestCard: {
      gap: 14,
    },
    requestUserRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    requestInfo: {
      flex: 1,
      gap: 4,
    },
    requestName: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    requestMeta: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
    requestActions: {
      flexDirection: 'row',
      gap: 10,
    },
    chatCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: theme.colors.surfaceSoft,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
    },
    chatInfo: {
      flex: 1,
      gap: 6,
    },
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    chatName: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '700',
    },
    chatTime: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: '600',
    },
    chatMeta: {
      color: theme.colors.textMuted,
      fontSize: 13,
    },
    chatFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    lastMessage: {
      flex: 1,
      color: theme.colors.textSoft,
      fontSize: 13,
    },
    unreadBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    unreadText: {
      color: theme.colors.accentText,
      fontSize: 12,
      fontWeight: '800',
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 8,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
    },
    floatingActions: {
      position: 'absolute',
      left: 18,
      right: 18,
    },
    floatingButton: {
      shadowColor: theme.colors.shadow,
    },
    overlay: {
      flex: 1,
      backgroundColor: theme.colors.surfaceOverlay,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: 72,
      paddingRight: 18,
    },
    centerOverlay: {
      flex: 1,
      backgroundColor: theme.colors.surfaceOverlay,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    menuSheet: {
      width: 250,
      gap: 10,
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
    profileModal: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      padding: 24,
      gap: 10,
    },
    profileName: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '800',
      marginTop: 4,
    },
    profileMeta: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
  });
