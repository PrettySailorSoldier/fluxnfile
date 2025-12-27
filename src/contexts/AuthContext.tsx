import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  team_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface Team {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  team: Team | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  createTeam: (teamName: string) => Promise<{ error: Error | null }>;
  joinTeam: (teamId: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileData) {
      setProfile(profileData);

      if (profileData.team_id) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('*')
          .eq('id', profileData.team_id)
          .single();

        if (teamData) {
          setTeam(teamData);
        }
      } else {
        setTeam(null);
      }
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    let initialLoadDone = false;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id).finally(() => {
              if (!initialLoadDone) {
                initialLoadDone = true;
                setLoading(false);
              }
            });
          }, 0);
        } else {
          setProfile(null);
          setTeam(null);
          if (!initialLoadDone) {
            initialLoadDone = true;
            setLoading(false);
          }
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (!initialLoadDone) {
            initialLoadDone = true;
            setLoading(false);
          }
        });
      } else {
        if (!initialLoadDone) {
          initialLoadDone = true;
          setLoading(false);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setTeam(null);
  };

  const createTeam = async (teamName: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    // Create the team
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .insert({ name: teamName, created_by: user.id })
      .select()
      .single();

    if (teamError) return { error: teamError as Error };

    // Update profile with team_id
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ team_id: teamData.id })
      .eq('id', user.id);

    if (profileError) return { error: profileError as Error };

    // Create default categories for the team
    const defaultCategories = [
      { name: 'Electronics', icon: 'Smartphone' },
      { name: 'Clothing & Accessories', icon: 'Shirt' },
      { name: 'Home & Kitchen', icon: 'Home' },
      { name: 'Toys & Games', icon: 'Gamepad2' },
      { name: 'Tools & Hardware', icon: 'Wrench' },
      { name: 'Furniture', icon: 'Armchair' },
      { name: 'Books & Media', icon: 'BookOpen' },
      { name: 'Sports & Outdoors', icon: 'Bike' },
    ];

    await supabase.from('categories').insert(
      defaultCategories.map((cat) => ({
        team_id: teamData.id,
        name: cat.name,
        icon: cat.icon,
        is_default: true,
      }))
    );

    await refreshProfile();
    return { error: null };
  };

  const joinTeam = async (teamId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('profiles')
      .update({ team_id: teamId })
      .eq('id', user.id);

    if (error) return { error: error as Error };

    await refreshProfile();
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        team,
        loading,
        signUp,
        signIn,
        signOut,
        createTeam,
        joinTeam,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
