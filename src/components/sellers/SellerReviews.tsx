import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Star, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Review {
  id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  bid_id: string;
}

interface PendingReview {
  bidId: string;
  sellerId: string;
  route: string;
}

interface SellerReviewsProps {
  sellerId: string;
  showWriteReview?: boolean;
}

export function SellerReviews({ sellerId, showWriteReview = false }: SellerReviewsProps) {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [user, setUser] = useState<any>(null);
  
  // Review form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBidId, setSelectedBidId] = useState<string>("");
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchReviews();
    checkPendingReviews();
  }, [sellerId]);

  const fetchReviews = async () => {
    try {
      const { data, error } = await supabase
        .from("seller_reviews")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      setReviews(data || []);
      
      if (data && data.length > 0) {
        const avg = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
        setAverageRating(avg);
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkPendingReviews = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    
    setUser(session.user);

    // Find accepted bids from this seller where user is the listing owner and hasn't reviewed yet
    const { data: acceptedBids } = await supabase
      .from("bids")
      .select(`
        id,
        seller_id,
        marketplace_listings!inner (
          user_id,
          ticket_requests (
            origin,
            destination
          )
        )
      `)
      .eq("seller_id", sellerId)
      .eq("status", "accepted")
      .eq("marketplace_listings.user_id", session.user.id);

    if (!acceptedBids || acceptedBids.length === 0) return;

    // Check which ones already have reviews
    const bidIds = acceptedBids.map(b => b.id);
    const { data: existingReviews } = await supabase
      .from("seller_reviews")
      .select("bid_id")
      .in("bid_id", bidIds)
      .eq("reviewer_id", session.user.id);

    const reviewedBidIds = new Set((existingReviews || []).map(r => r.bid_id));
    
    const pending = acceptedBids
      .filter(b => !reviewedBidIds.has(b.id))
      .map(b => ({
        bidId: b.id,
        sellerId: b.seller_id,
        route: `${(b.marketplace_listings as any)?.ticket_requests?.origin} → ${(b.marketplace_listings as any)?.ticket_requests?.destination}`,
      }));

    setPendingReviews(pending);
  };

  const handleSubmitReview = async () => {
    if (!selectedBidId || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("seller_reviews")
        .insert({
          seller_id: sellerId,
          reviewer_id: user.id,
          bid_id: selectedBidId,
          rating,
          review_text: reviewText || null,
        });

      if (error) throw error;

      toast({
        title: "Review submitted",
        description: "Thank you for your feedback!",
      });

      setDialogOpen(false);
      setRating(5);
      setReviewText("");
      setSelectedBidId("");
      fetchReviews();
      checkPendingReviews();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit review",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (count: number, interactive = false, onSelect?: (n: number) => void) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`w-5 h-5 ${
              n <= count ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            } ${interactive ? "cursor-pointer hover:scale-110 transition-transform" : ""}`}
            onClick={interactive && onSelect ? () => onSelect(n) : undefined}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            Reviews
            {reviews.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({reviews.length})
              </span>
            )}
          </CardTitle>
          {averageRating > 0 && (
            <div className="flex items-center gap-2">
              {renderStars(Math.round(averageRating))}
              <span className="text-lg font-bold">{averageRating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Write Review Button */}
        {showWriteReview && pendingReviews.length > 0 && (
          <div className="mb-6 p-4 rounded-lg border border-primary/30 bg-primary/5">
            <p className="text-sm mb-3">
              You have {pendingReviews.length} completed transaction{pendingReviews.length > 1 ? "s" : ""} to review
            </p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Write a Review</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Write a Review</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  {pendingReviews.length > 1 && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">Select Transaction</label>
                      <select
                        className="w-full p-2 rounded-md border bg-background"
                        value={selectedBidId}
                        onChange={(e) => setSelectedBidId(e.target.value)}
                      >
                        <option value="">Select...</option>
                        {pendingReviews.map((pr) => (
                          <option key={pr.bidId} value={pr.bidId}>
                            {pr.route}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {pendingReviews.length === 1 && (
                    <p className="text-sm text-muted-foreground">
                      Reviewing transaction: {pendingReviews[0].route}
                    </p>
                  )}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Rating</label>
                    {renderStars(rating, true, setRating)}
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Review (optional)</label>
                    <Textarea
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      placeholder="Share your experience..."
                      rows={4}
                    />
                  </div>
                  <Button
                    onClick={() => {
                      if (pendingReviews.length === 1) {
                        setSelectedBidId(pendingReviews[0].bidId);
                      }
                      if (selectedBidId || pendingReviews.length === 1) {
                        handleSubmitReview();
                      }
                    }}
                    disabled={submitting || (pendingReviews.length > 1 && !selectedBidId)}
                    className="w-full"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Review"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Reviews List */}
        {reviews.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No reviews yet
          </p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="p-4 rounded-lg border border-border bg-card/50"
              >
                <div className="flex items-center justify-between mb-2">
                  {renderStars(review.rating)}
                  <span className="text-sm text-muted-foreground">
                    {format(parseISO(review.created_at), "MMM d, yyyy")}
                  </span>
                </div>
                {review.review_text && (
                  <p className="text-sm">{review.review_text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
