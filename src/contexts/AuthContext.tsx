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
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  createTeam: (teamName: string) => Promise<{ error: Error | null }>;
  joinTeam: (teamId: string) => Promise<{ error: Error | null }>;
  leaveTeam: () => Promise<{ error: Error | null }>;
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

  const signIn = async (email: string, password: string, rememberMe: boolean = true) => {
    // If not remembering, we still use localStorage but session will be shorter
    // Supabase handles token refresh automatically
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // If user doesn't want to be remembered, we'll clear session on browser close
    if (!rememberMe && !error) {
      // Store flag to clear on next load if browser was closed
      sessionStorage.setItem('clear_session_on_close', 'true');
    } else {
      sessionStorage.removeItem('clear_session_on_close');
    }

    return { error: error as Error | null };
  };

  const signInWithGoogle = async () => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
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

    // Update profile with team_id and get the updated profile back
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .update({ team_id: teamData.id })
      .eq('id', user.id)
      .select()
      .single();

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

    // Update state immediately with the new data to avoid race conditions
    setProfile(updatedProfile);
    setTeam(teamData);

    return { error: null };
  };

  const joinTeam = async (teamId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    // Use security definer function to verify team exists (bypasses RLS)
    const { data: teamResult, error: verifyError } = await supabase
      .rpc('verify_team_exists', { team_uuid: teamId });

    if (verifyError || !teamResult || teamResult.length === 0) {
      return { error: new Error('Team not found') };
    }

    const teamData = teamResult[0];

    // Update profile with team_id
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .update({ team_id: teamId })
      .eq('id', user.id)
      .select()
      .single();

    if (profileError) return { error: profileError as Error };

    // Update state immediately
    setProfile(updatedProfile);
    setTeam({ id: teamData.id, name: teamData.name });

    return { error: null };
  };

  const leaveTeam = async () => {
    if (!user) return { error: new Error('Not authenticated') };

    // Update profile to remove team_id
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .update({ team_id: null })
      .eq('id', user.id)
      .select()
      .single();

    if (profileError) return { error: profileError as Error };

    // Update state immediately
    setProfile(updatedProfile);
    setTeam(null);

    return { error: null };
  };

  const leaveTeam = async () => {
    if (!user) return { error: new Error('Not authenticated') };

    // Update profile to remove team_id
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .update({ team_id: null })
      .eq('id', user.id)
      .select()
      .single();

    if (profileError) return { error: profileError as Error };

    // Update state immediately
    setProfile(updatedProfile);
    setTeam(null);

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
        signInWithGoogle,
        signOut,
        createTeam,
        joinTeam,
        leaveTeam,
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
