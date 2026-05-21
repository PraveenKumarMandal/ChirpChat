import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAvatar, AppBadge, AppButton, AppCard, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api, { getApiErrorMessage } from '../services/api';
import socket from '../services/socket';

type Message = {
  _id?: string;
  text: string;
  sender: string;
  receiver: string;
  time?: string;
  messageType?: 'text' | 'image' | 'file';
  mediaUrl?: string;
  mediaName?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  status?: 'sent' | 'delivered' | 'read';
  deliveredAt?: string | null;
  readAt?: string | null;
};

type FriendSummary = {
  _id: string;
  name: string;
  email: string;
  username: string;
  profilePicture?: string;
  isOnline?: boolean;
  lastSeen?: string;
};

const formatStatus = (status?: string) => {
  if (status === 'read') return 'Read';
  if (status === 'delivered') return 'Delivered';
  return 'Sent';
};

const formatPresence = (friend: FriendSummary | null, isTyping: boolean) => {
  if (isTyping) {
    return 'Typing...';
  }

  if (!friend) {
    return 'Loading...';
  }

  if (friend.isOnline) {
    return 'Online now';
  }

  if (!friend.lastSeen) {
    return 'Offline';
  }

  return `Last seen ${new Date(friend.lastSeen).toLocaleString()}`;
};

export default function Chat() {
  const { currentUser } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useLocalSearchParams<{ user?: string }>();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const listRef = useRef<FlatList<Message>>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [friend, setFriend] = useState<FriendSummary | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!currentUser?._id || !user) {
      return;
    }

    const loadChatData = async () => {
      try {
        const [messagesRes, friendRes] = await Promise.all([
          api.get(`/messages/${currentUser._id}/${user}`),
          api.get(`/users/${user}/summary`),
        ]);

        setMessages(messagesRes.data);
        setFriend(friendRes.data);
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: false });
        });
      } catch (error) {
        Alert.alert('Load failed', getApiErrorMessage(error, 'Could not load this chat right now.'));
      }
    };

    const markAsRead = () => {
      socket.emit('markMessagesRead', {
        chatUserId: user,
      });
    };

    const handleMessage = (incomingMessage: Message) => {
      if (
        (incomingMessage.sender === currentUser._id && incomingMessage.receiver === user) ||
        (incomingMessage.sender === user && incomingMessage.receiver === currentUser._id)
      ) {
        setMessages((prev) => {
          if (prev.some((item) => item._id === incomingMessage._id)) {
            return prev;
          }

          return [...prev, incomingMessage];
        });

        if (incomingMessage.sender === user) {
          markAsRead();
        }
      }
    };

    const handleStatus = (update: {
      messageId: string;
      status: Message['status'];
      deliveredAt?: string;
      readAt?: string;
    }) => {
      setMessages((prev) =>
        prev.map((item) =>
          item._id === update.messageId
            ? {
                ...item,
                status: update.status,
                deliveredAt: update.deliveredAt || item.deliveredAt,
                readAt: update.readAt || item.readAt,
              }
            : item
        )
      );
    };

    const handleTyping = (update: { userId: string; isTyping: boolean }) => {
      if (update.userId === user) {
        setIsTyping(update.isTyping);
      }
    };

    const handlePresence = (update: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      if (update.userId === user) {
        setFriend((prev) =>
          prev
            ? {
                ...prev,
                isOnline: update.isOnline,
                lastSeen: update.lastSeen,
              }
            : prev
        );
      }
    };

    const handleMessageError = (payload: { error?: string }) => {
      Alert.alert('Message failed', payload.error || 'Could not send this message.');
    };

    loadChatData();
    markAsRead();

    socket.on('receiveMessage', handleMessage);
    socket.on('messageStatusUpdate', handleStatus);
    socket.on('typingUpdate', handleTyping);
    socket.on('presenceUpdate', handlePresence);
    socket.on('messageError', handleMessageError);

    return () => {
      socket.emit('typingStop', {
        receiver: user,
      });
      socket.off('receiveMessage', handleMessage);
      socket.off('messageStatusUpdate', handleStatus);
      socket.off('typingUpdate', handleTyping);
      socket.off('presenceUpdate', handlePresence);
      socket.off('messageError', handleMessageError);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [currentUser?._id, user]);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages]);

  useEffect(() => {
    const scrollToLatest = () => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    };

    const showSubscription = Keyboard.addListener('keyboardDidShow', scrollToLatest);

    return () => {
      showSubscription.remove();
    };
  }, []);

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  const emitTyping = (value: string) => {
    setMessage(value);

    if (!currentUser._id || !user) {
      return;
    }

    socket.emit('typingStart', {
      receiver: user,
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typingStop', {
        receiver: user,
      });
    }, 1200);
  };

  const stopTyping = () => {
    if (!currentUser._id || !user) {
      return;
    }

    socket.emit('typingStop', {
      receiver: user,
    });
  };

  const sendMessage = () => {
    if (!message.trim() || !currentUser._id || !user || isUploading) {
      return;
    }

    socket.emit('sendMessage', {
      text: message.trim(),
      receiver: user,
      messageType: 'text',
    });

    stopTyping();
    setMessage('');
  };

  const uploadAndSend = async (asset: {
    uri: string;
    name?: string;
    mimeType?: string;
    file?: File;
  }) => {
    if (!currentUser._id || !user) {
      return;
    }

    const formData = new FormData();

    formData.append('receiver', user);

    if (Platform.OS === 'web' && asset.file) {
      formData.append('media', asset.file);
    } else {
      formData.append('media', {
        uri: asset.uri,
        name: asset.name || `upload-${Date.now()}`,
        type: asset.mimeType || 'application/octet-stream',
      } as unknown as Blob);
    }

    setIsUploading(true);

    try {
      const uploadResponse = await api.post('/messages/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      socket.emit('sendMessage', {
        text: '',
        receiver: user,
        ...uploadResponse.data,
      });
    } catch (error: any) {
      Alert.alert('Upload failed', getApiErrorMessage(error, 'Could not upload this attachment.'));
    } finally {
      setIsUploading(false);
      setIsSendingFile(false);
      setAttachmentMenuOpen(false);
    }
  };

  const sendImage = async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo access to send an image.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (result.canceled || !result.assets.length) {
        setAttachmentMenuOpen(false);
        return;
      }

      const asset = result.assets[0];
      await uploadAndSend({
        uri: asset.uri,
        name: asset.fileName || `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        file: asset.file,
      });
    } catch (error) {
      console.log('Image send error:', error);
      Alert.alert('Send failed', 'Could not send this image.');
      setAttachmentMenuOpen(false);
    }
  };

  const sendFile = async () => {
    try {
      setIsSendingFile(true);
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets.length) {
        setIsSendingFile(false);
        setAttachmentMenuOpen(false);
        return;
      }

      const asset = result.assets[0];
      await uploadAndSend({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
        file: asset.file,
      });
    } catch (error) {
      console.log('File send error:', error);
      Alert.alert('Send failed', 'Could not send this file.');
      setIsSendingFile(false);
      setAttachmentMenuOpen(false);
    }
  };

  const openAttachment = async (url: string) => {
    const supported = await Linking.canOpenURL(url);

    if (!supported) {
      Alert.alert('Unavailable', 'Could not open this attachment on your device.');
      return;
    }

    await Linking.openURL(url);
  };

  const renderMessageBody = (item: Message, isMine: boolean) => {
    if (item.messageType === 'image' && item.mediaUrl) {
      return (
        <TouchableOpacity onPress={() => openAttachment(item.mediaUrl || '')} activeOpacity={0.92}>
          <Image source={{ uri: item.mediaUrl }} style={styles.imageMessage} />
        </TouchableOpacity>
      );
    }

    if (item.messageType === 'file' && item.mediaUrl) {
      return (
        <TouchableOpacity style={styles.fileCard} onPress={() => openAttachment(item.mediaUrl || '')} activeOpacity={0.92}>
          <Ionicons name="document-attach-outline" size={18} color={theme.colors.text} />
          <View style={styles.fileInfo}>
            <Text style={styles.fileName}>{item.mediaName || 'Open file'}</Text>
            <Text style={styles.fileMeta}>{item.mediaMimeType || 'File attachment'}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return <Text style={[styles.messageText, !isMine && styles.messageTextOther]}>{item.text}</Text>;
  };

  return (
    <AppScreen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 12 : 0}
      >
        <View style={styles.container}>
          <View style={styles.headerOuter}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.9}>
              <Ionicons name="chevron-back-outline" size={22} color={theme.colors.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.chatHeader} onPress={() => setProfileOpen(true)} disabled={!friend} activeOpacity={0.92}>
              <AppAvatar uri={friend?.profilePicture} name={friend?.name} size={58} />
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerName}>{friend?.username || friend?.name || 'Chat'}</Text>
                <Text style={styles.presenceText}>{formatPresence(friend, isTyping)}</Text>
              </View>
              {friend?.isOnline ? <AppBadge text="Online" tone="success" /> : null}
            </TouchableOpacity>
          </View>

          {!user ? <Text style={styles.emptyState}>Missing chat details. Please choose a friend again.</Text> : null}

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item, index) => item._id || index.toString()}
            contentContainerStyle={[styles.messageList, { paddingBottom: 16 }]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isMine = item.sender === currentUser._id;
              return (
                <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
                  <View style={[styles.messageBubble, isMine ? styles.myMessage : styles.otherMessage]}>
                    <View style={isMine ? null : styles.otherMessageContent}>
                      {renderMessageBody(item, isMine)}
                    </View>
                    <Text style={[styles.messageTime, isMine ? styles.myMessageTime : styles.otherMessageTime]}>
                      {item.time
                        ? new Date(item.time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                      {isMine ? `  ${formatStatus(item.status)}` : ''}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={[styles.composerOuter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            {attachmentMenuOpen ? (
              <AppCard style={styles.attachmentMenu}>
                <AppButton variant="secondary" onPress={sendImage} leftIcon="image-outline">
                  Send photo
                </AppButton>
                <AppButton variant="secondary" onPress={sendFile} leftIcon="document-outline">
                  {isSendingFile ? 'Opening...' : 'Send file'}
                </AppButton>
              </AppCard>
            ) : null}

            <View style={styles.composerBubble}>
              <TouchableOpacity
                style={styles.attachButton}
                onPress={() => setAttachmentMenuOpen((prev) => !prev)}
                disabled={isUploading}
                activeOpacity={0.9}
              >
                <Ionicons name="add-outline" size={22} color={theme.colors.text} />
              </TouchableOpacity>
              <TextInput
                value={message}
                onChangeText={emitTyping}
                onFocus={() => {
                  requestAnimationFrame(() => {
                    listRef.current?.scrollToEnd({ animated: true });
                  });
                }}
                placeholder="Type a message"
                placeholderTextColor={theme.colors.textSoft}
                style={styles.input}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBubble, (!message.trim() || isUploading) && styles.sendBubbleDisabled]}
                onPress={sendMessage}
                disabled={!message.trim() || isUploading}
                activeOpacity={0.9}
              >
                <Ionicons
                  name={isUploading ? 'cloud-upload-outline' : 'arrow-up-outline'}
                  size={20}
                  color={(!message.trim() || isUploading) ? theme.colors.textSoft : theme.colors.accentText}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={profileOpen} transparent animationType="fade" onRequestClose={() => setProfileOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setProfileOpen(false)}>
          <View style={styles.profileModal}>
            <AppAvatar uri={friend?.profilePicture} name={friend?.name} size={150} />
            <Text style={styles.profileName}>{friend?.name}</Text>
            <Text style={styles.profileMeta}>@{friend?.username}</Text>
            {friend?.email ? <Text style={styles.profileMeta}>{friend.email}</Text> : null}
            <Text style={styles.profileMeta}>{formatPresence(friend, false)}</Text>
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
    flex: {
      flex: 1,
    },
    container: {
      flex: 1,
      gap: 12,
    },
    headerOuter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    backButton: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceRaised,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chatHeader: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 24,
      padding: 12,
    },
    headerTextWrap: {
      flex: 1,
      gap: 4,
    },
    headerName: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '800',
    },
    presenceText: {
      color: theme.colors.textMuted,
      fontSize: 13,
    },
    emptyState: {
      color: theme.colors.danger,
      marginBottom: 12,
    },
    messageList: {
      paddingTop: 10,
      gap: 10,
    },
    messageRow: {
      flexDirection: 'row',
    },
    messageRowMine: {
      justifyContent: 'flex-end',
    },
    messageRowOther: {
      justifyContent: 'flex-start',
    },
    messageBubble: {
      maxWidth: '84%',
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
    },
    myMessage: {
      backgroundColor: theme.colors.accent,
      borderColor: 'transparent',
    },
    otherMessage: {
      backgroundColor: theme.colors.surfaceSoft,
      borderColor: theme.colors.border,
    },
    otherMessageContent: {
      alignSelf: 'stretch',
    },
    messageText: {
      color: theme.colors.accentText,
      lineHeight: 21,
      fontSize: 15,
    },
    messageTextOther: {
      color: theme.colors.text,
    },
    imageMessage: {
      width: 210,
      height: 210,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceRaised,
    },
    fileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.colors.surfaceOverlay,
      borderRadius: 16,
      padding: 12,
    },
    fileInfo: {
      flex: 1,
      gap: 4,
    },
    fileName: {
      color: theme.colors.text,
      fontWeight: '800',
    },
    fileMeta: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    messageTime: {
      fontSize: 11,
      marginTop: 8,
      textAlign: 'right',
      fontWeight: '700',
    },
    myMessageTime: {
      color: theme.mode === 'dark' ? 'rgba(9, 9, 11, 0.76)' : theme.colors.textSoft,
    },
    otherMessageTime: {
      color: theme.colors.textSoft,
    },
    composerOuter: {
      position: 'relative',
    },
    composerBubble: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingLeft: 10,
      paddingRight: 8,
      paddingVertical: 8,
      minHeight: 60,
      gap: 8,
    },
    attachButton: {
      width: 42,
      height: 42,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    input: {
      flex: 1,
      maxHeight: 110,
      color: theme.colors.text,
      paddingTop: 10,
      paddingBottom: 10,
      fontSize: 15,
    },
    sendBubble: {
      width: 42,
      height: 42,
      borderRadius: 16,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    sendBubbleDisabled: {
      backgroundColor: theme.colors.surfaceSoft,
    },
    attachmentMenu: {
      position: 'absolute',
      left: 0,
      right: 80,
      bottom: 74,
      gap: 10,
      padding: 12,
      zIndex: 20,
    },
    overlay: {
      flex: 1,
      backgroundColor: theme.colors.surfaceOverlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    profileModal: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 24,
      alignItems: 'center',
      gap: 10,
    },
    profileName: {
      color: theme.colors.text,
      fontSize: 26,
      fontWeight: '800',
      marginTop: 4,
    },
    profileMeta: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
  });
