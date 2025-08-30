// frontend/app/settings/page.tsx

"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { ArrowLeft, Save, User, Settings } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import CalendarSettings from "@/components/calendar-settings"
import { useProfileStore } from "@/lib/profile-store"

export default function SettingsPage() {
  const { isAuthenticated } = useAuth()
  const { profile, updateProfile } = useProfileStore()
  const [isSaving, setIsSaving] = useState(false)
  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  })

  // Initialize with user data
  useEffect(() => {
    if (profile) {
      
      setPersonalInfo({
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        email: profile.email || "",
        phone: profile.phone || "",
      })
    }
  }, [profile])

  const handleSave = async () => {
    if (!profile) return; 
    setIsSaving(true)
     try {
      // The local 'personalInfo' state has all the user's changes.
      // We pass this object to the updateProfile function.
      await updateProfile(personalInfo);
      
      toast({
        title: "Settings Saved",
        description: "Your settings have been updated successfully.",
      })
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Save Failed",
        description: "There was an error saving your settings. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false)
    }
  }

  // Show sign-in prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50">
        <div className="border-b border-slate-200 bg-white">
          <div className="flex h-16 items-center px-6">
            <Link href="/" className="flex items-center text-sm font-medium hover:text-purple-600">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-md card-colorful">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <Settings className="h-6 w-6 text-orange-600" />
              </div>
              <CardTitle className="text-orange-600">Sign In Required</CardTitle>
              <CardDescription>
                Please sign in with Google to access settings
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/">
                <Button className="btn-purple">
                  Go to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center px-6">
          <Link href="/" className="flex items-center text-sm font-medium hover:text-purple-600">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="ml-auto flex items-center space-x-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="btn-purple">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-purple-600">Settings</h1>
          <p className="text-muted-foreground">Manage your account settings and preferences.</p>
        </div>

        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-4 bg-slate-100">
            <TabsTrigger value="account" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              Account
            </TabsTrigger>
            <TabsTrigger value="calendar" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              Calendar
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              Notifications
            </TabsTrigger>
            <TabsTrigger value="appearance" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              Appearance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <Card className="card-colorful">
              <CardHeader>
                <CardTitle className="text-purple-600">Account Information</CardTitle>
                <CardDescription>Update your account details and preferences.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Personal Information</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="first-name">First name</Label>
                      <Input 
                        id="first-name" 
                        value={personalInfo.firstName}
                        onChange={(e) => setPersonalInfo(prev => ({...prev, firstName: e.target.value}))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last-name">Last name</Label>
                      <Input 
                        id="last-name" 
                        value={personalInfo.lastName}
                        onChange={(e) => setPersonalInfo(prev => ({...prev, lastName: e.target.value}))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input 
                        id="email" 
                        value={personalInfo.email}
                        disabled
                        className="bg-slate-100"
                      />
                      <p className="text-xs text-slate-500">Email from Google account cannot be changed</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input 
                        id="phone" 
                        value={personalInfo.phone}
                        placeholder="Enter phone number"
                        onChange={(e) => setPersonalInfo(prev => ({...prev, phone: e.target.value}))}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Password</h3>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800 font-medium">Google Account Authentication</p>
                    <p className="text-xs text-blue-600 mt-1">
                      You're signed in with Google. Password management is handled by your Google account.
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Timezone</h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <select
                        id="timezone"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        defaultValue="Asia/Dhaka"
                      >
                        <option value="Asia/Dhaka">Dhaka (GMT+6)</option>
                        <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                        <option value="America/New_York">Eastern Time (US & Canada)</option>
                        <option value="UTC">UTC</option>
                        <option value="Europe/London">London</option>
                        <option value="Asia/Tokyo">Tokyo</option>
                      </select>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving} className="btn-purple">
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarSettings />
          </TabsContent>

          <TabsContent value="notifications">
            <Card className="card-colorful">
              <CardHeader>
                <CardTitle className="text-green-600">Notification Settings</CardTitle>
                <CardDescription>Configure how you receive notifications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Email Notifications</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="email-tasks">Task Reminders</Label>
                        <p className="text-sm text-muted-foreground">Receive email notifications for upcoming tasks</p>
                      </div>
                      <Switch id="email-tasks" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="email-events">Event Notifications</Label>
                        <p className="text-sm text-muted-foreground">Receive email notifications for upcoming events</p>
                      </div>
                      <Switch id="email-events" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="email-plans">Plan Generation</Label>
                        <p className="text-sm text-muted-foreground">Get notified when AI generates new learning plans</p>
                      </div>
                      <Switch id="email-plans" defaultChecked />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Push Notifications</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="push-tasks">Task Reminders</Label>
                        <p className="text-sm text-muted-foreground">Receive push notifications for upcoming tasks</p>
                      </div>
                      <Switch id="push-tasks" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="push-events">Event Notifications</Label>
                        <p className="text-sm text-muted-foreground">Receive push notifications for upcoming events</p>
                      </div>
                      <Switch id="push-events" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="push-calendar">Calendar Sync</Label>
                        <p className="text-sm text-muted-foreground">Get notified when calendar events are synced</p>
                      </div>
                      <Switch id="push-calendar" />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">AI Assistant</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="ai-suggestions">Daily Suggestions</Label>
                        <p className="text-sm text-muted-foreground">Receive AI-powered learning suggestions</p>
                      </div>
                      <Switch id="ai-suggestions" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="ai-progress">Progress Reports</Label>
                        <p className="text-sm text-muted-foreground">Get weekly progress summaries from AI</p>
                      </div>
                      <Switch id="ai-progress" defaultChecked />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving} className="btn-green">
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="appearance">
            <Card className="card-colorful">
              <CardHeader>
                <CardTitle className="text-orange-600">Appearance Settings</CardTitle>
                <CardDescription>Customize the look and feel of the application.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Theme</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <div className="border rounded-md p-4 cursor-pointer bg-background hover:border-purple-300 transition-colors">
                        <div className="space-y-2">
                          <div className="h-2 w-[80%] rounded-full bg-purple-200"></div>
                          <div className="h-2 w-[60%] rounded-full bg-blue-200"></div>
                          <div className="h-2 w-[70%] rounded-full bg-green-200"></div>
                        </div>
                        <div className="mt-3 text-center text-sm font-medium">Light</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="border rounded-md p-4 cursor-pointer bg-zinc-950 hover:border-purple-300 transition-colors">
                        <div className="space-y-2">
                          <div className="h-2 w-[80%] rounded-full bg-purple-400"></div>
                          <div className="h-2 w-[60%] rounded-full bg-blue-400"></div>
                          <div className="h-2 w-[70%] rounded-full bg-green-400"></div>
                        </div>
                        <div className="mt-3 text-center text-sm font-medium text-white">Dark</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="border rounded-md p-4 cursor-pointer bg-background hover:border-purple-300 transition-colors">
                        <div className="space-y-2">
                          <div className="h-2 w-[80%] rounded-full bg-slate-300"></div>
                          <div className="h-2 w-[60%] rounded-full bg-slate-300"></div>
                          <div className="h-2 w-[70%] rounded-full bg-slate-300"></div>
                        </div>
                        <div className="mt-3 text-center text-sm font-medium">System</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Choose your preferred color theme. System will match your device settings.
                  </p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Calendar View</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="compact-view">Compact View</Label>
                        <p className="text-sm text-muted-foreground">Show more events in less space</p>
                      </div>
                      <Switch id="compact-view" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="weekend-display">Show Weekends</Label>
                        <p className="text-sm text-muted-foreground">Display Saturday and Sunday in weekly view</p>
                      </div>
                      <Switch id="weekend-display" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="time-format">24-hour Format</Label>
                        <p className="text-sm text-muted-foreground">Use 24-hour time format instead of AM/PM</p>
                      </div>
                      <Switch id="time-format" />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Task Display</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="show-completed">Show Completed Tasks</Label>
                        <p className="text-sm text-muted-foreground">Display completed tasks in your lists</p>
                      </div>
                      <Switch id="show-completed" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-archive">Auto-archive Completed</Label>
                        <p className="text-sm text-muted-foreground">Automatically hide tasks after 7 days</p>
                      </div>
                      <Switch id="auto-archive" />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving} className="btn-orange">
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}