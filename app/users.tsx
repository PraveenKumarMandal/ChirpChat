import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppAvatar, AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api from '../services/api';

type SearchUser = {
  _id: string;
  name: string;
  email: string;
  username: string;
  profilePicture?: string;
  relationStatus: 'none' | 'sent' | 'received' | 'accepted' | 'rejected';
};

export default function Users() {
  const { currentUser } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  const searchUsers = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setSearching(true);
      const response = await api.get('/users/search', {
        params: {
          q: query.trim(),
          currentUserId: currentUser._id,
        },
      });
      setResults(response.data);
    } catch {
      Alert.alert('Search failed', 'Could not search users right now.');
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (targetUserId: string) => {
    try {
      await api.post('/friend-requests', {
        fromUserId: currentUser._id,
        toUserId: targetUserId,
      });
      await searchUsers();
      Alert.alert('Request sent', 'Your friend request has been sent.');
    } catch (error: any) {
      Alert.alert('Request failed', error.response?.data?.error || 'Could not send request.');
    }
  };

  const refreshResults = async () => {
    if (!results.length && !query.trim()) {
      return;
    }

    try {
      setRefreshing(true);
      await searchUsers();
    } finally {
      setRefreshing(false);
    }
  };

  const renderAction = (item: SearchUser) => {
    if (item.relationStatus === 'accepted') {
      return <AppBadge text="Connected" tone="success" />;
    }

    if (item.relationStatus === 'sent') {
      return <AppBadge text="Request sent" tone="warning" />;
    }

    if (item.relationStatus === 'received') {
      return <AppBadge text="Accept from Home" tone="warning" />;
    }

    return <AppButton onPress={() => sendRequest(item._id)}>Send request</AppButton>;
  };

  return (
    <AppScreen style={styles.screen}>
      <AppCard>
        <Text style={styles.eyebrow}>Discover</Text>
        <Text style={styles.title}>Find new friends</Text>
        <Text style={styles.subtitle}>Search by username, name, or email and expand your ChirpChat circle.</Text>

        <AppInput
          placeholder="Search username or email"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={searchUsers}
          autoCapitalize="none"
        />

        <AppButton onPress={searchUsers} disabled={searching} leftIcon="search-outline">
          {searching ? 'Searching...' : 'Search'}
        </AppButton>
      </AppCard>

      <FlatList
        data={results}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 36, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshResults} tintColor={theme.colors.accent} />}
        renderItem={({ item }) => (
          <AppCard style={styles.resultCard}>
            <View style={styles.resultRow}>
              <AppAvatar uri={item.profilePicture} name={item.name} size={64} />
              <View style={styles.resultInfo}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>@{item.username}</Text>
                <Text style={styles.meta}>{item.email}</Text>
              </View>
            </View>
            {renderAction(item)}
          </AppCard>
        )}
        ListEmptyComponent={
          <AppCard>
            <Text style={styles.emptyTitle}>Search for people</Text>
            <Text style={styles.emptyText}>Start with a username or email to send a new friend request.</Text>
          </AppCard>
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
      marginBottom: 8,
    },
    resultCard: {
      gap: 14,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    resultInfo: {
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
  });
