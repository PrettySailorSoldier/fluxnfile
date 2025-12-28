import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting review reminder check...');

    // Create Supabase client with service role for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the date 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoISO = threeDaysAgo.toISOString();

    console.log(`Looking for Amazon items created before ${threeDaysAgoISO} that need review...`);

    // Find Amazon items that:
    // 1. Were created more than 3 days ago
    // 2. Have pending review status (not reviewed by both)
    // 3. Are from Amazon
    const { data: pendingItems, error: itemsError } = await supabase
      .from('items')
      .select('id, title, team_id, reviewed_by, amazon_review_status, created_at')
      .eq('acquisition_source', 'Amazon')
      .in('amazon_review_status', ['pending', 'reviewed_grant', 'reviewed_crybaby'])
      .lt('created_at', threeDaysAgoISO);

    if (itemsError) {
      console.error('Error fetching pending items:', itemsError);
      throw itemsError;
    }

    console.log(`Found ${pendingItems?.length || 0} items needing review reminders`);

    if (!pendingItems || pendingItems.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No items need review reminders', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group items by team
    const itemsByTeam = new Map<string, typeof pendingItems>();
    for (const item of pendingItems) {
      const teamItems = itemsByTeam.get(item.team_id) || [];
      teamItems.push(item);
      itemsByTeam.set(item.team_id, teamItems);
    }

    console.log(`Items grouped into ${itemsByTeam.size} teams`);

    let notificationsCreated = 0;

    // For each team, get team members and create notifications
    for (const [teamId, items] of itemsByTeam) {
      console.log(`Processing team ${teamId} with ${items.length} items`);

      // Get all team members
      const { data: teamMembers, error: membersError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('team_id', teamId);

      if (membersError) {
        console.error(`Error fetching team members for team ${teamId}:`, membersError);
        continue;
      }

      if (!teamMembers || teamMembers.length === 0) {
        console.log(`No team members found for team ${teamId}`);
        continue;
      }

      console.log(`Found ${teamMembers.length} team members`);

      // For each team member, check which items they haven't reviewed
      for (const member of teamMembers) {
        const unreviewedItems = items.filter(item => {
          const reviewedBy = item.reviewed_by || [];
          return !reviewedBy.includes(member.id);
        });

        if (unreviewedItems.length === 0) {
          console.log(`Member ${member.id} has reviewed all pending items`);
          continue;
        }

        console.log(`Member ${member.id} has ${unreviewedItems.length} unreviewed items`);

        // Check if we already sent a reminder today
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: existingNotification, error: notifCheckError } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', member.id)
          .eq('type', 'review_reminder')
          .gte('created_at', today.toISOString())
          .limit(1);

        if (notifCheckError) {
          console.error(`Error checking existing notifications for ${member.id}:`, notifCheckError);
          continue;
        }

        if (existingNotification && existingNotification.length > 0) {
          console.log(`Already sent reminder to ${member.id} today, skipping`);
          continue;
        }

        // Create notification
        const itemCount = unreviewedItems.length;
        const { error: insertError } = await supabase
          .from('notifications')
          .insert({
            user_id: member.id,
            team_id: teamId,
            type: 'review_reminder',
            title: 'Amazon Items Need Review',
            message: `You have ${itemCount} Amazon item${itemCount === 1 ? '' : 's'} that ${itemCount === 1 ? 'has' : 'have'} been waiting for your review for more than 3 days.`,
            link: '/inventory?reviewFilter=pending',
            is_read: false,
          });

        if (insertError) {
          console.error(`Error creating notification for ${member.id}:`, insertError);
        } else {
          notificationsCreated++;
          console.log(`Created review reminder notification for ${member.id}`);
        }
      }
    }

    console.log(`Review reminder check complete. Created ${notificationsCreated} notifications.`);

    return new Response(
      JSON.stringify({ 
        message: 'Review reminder check complete', 
        itemsChecked: pendingItems.length,
        notificationsCreated 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in review-reminder function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
