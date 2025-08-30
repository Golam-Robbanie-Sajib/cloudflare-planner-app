//app/profile/page.tsx

"use client"

import { useState, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ArrowLeft, Mail, Phone, MapPin, Briefcase, Calendar, Edit, Save, User } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { useCalendarStore } from "@/lib/calendar-store"
import { useProfileStore } from "@/lib/profile-store"

export default function ProfilePage() {
  const { isAuthenticated, userInfo } = useAuth()
  const { tasks } = useCalendarStore()
  const { profile, loading, updateProfile } = useProfileStore()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  


  // Calculate task statistics
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(task => task.completed).length
  const upcomingTasks = tasks.filter(task => !task.completed && new Date(task.date) >= new Date()).length
  const productivity = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const handleSaveProfile = async (formData: FormData) => {
    const updatedData = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      location: formData.get("location") as string,
      company: formData.get("company") as string,
      position: formData.get("position") as string,
    }

    await updateProfile(updatedData)
    setIsEditDialogOpen(false)

    toast({
      title: "Profile Updated",
      description: "Your profile information has been saved successfully.",
    })
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
              <div className="mx-auto w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <User className="h-6 w-6 text-purple-600" />
              </div>
              <CardTitle className="text-purple-600">Sign In Required</CardTitle>
              <CardDescription>
                Please sign in with Google to view your profile
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

// This shows a message while the profile is being fetched from Firestore
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  // +++ ADD THIS BLOCK +++
  // This shows an error if the profile could not be fetched (e.g., network error)
  if (!profile) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-destructive">Error: Could not load user profile.</p>
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
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="hover:bg-purple-50 hover:border-purple-300">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Profile
                </Button>
              </DialogTrigger>
              <DialogContent className="card-colorful max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-purple-600">Edit Profile</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const formData = new FormData(e.currentTarget)
                    handleSaveProfile(formData)
                  }}
                  className="space-y-4 pt-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" name="firstName" defaultValue={profile.firstName} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" name="lastName" defaultValue={profile.lastName} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input 
                      id="email" 
                      name="email" 
                      type="email" 
                      defaultValue={profile.email}
                      disabled={!!userInfo} // Disable if from Google auth
                      className={userInfo ? "bg-slate-100" : ""}
                    />
                    {userInfo && (
                      <p className="text-xs text-slate-500">Email from Google account cannot be changed</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" defaultValue={profile.phone} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" name="location" defaultValue={profile.location} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input id="company" name="company" defaultValue={profile.company} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="position">Position</Label>
                    <Input id="position" name="position" defaultValue={profile.position} />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditDialogOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="btn-purple flex-1">
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-col items-center space-y-4 sm:flex-row sm:space-y-0 sm:space-x-6">
          <Avatar className="h-24 w-24 shadow-lg">
            <AvatarImage src={userInfo?.picture} alt={profile.firstName} />
            <AvatarFallback className="bg-purple-500 text-white text-2xl font-bold">
              {profile.firstName.charAt(0)}
              {profile.lastName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-purple-600">
              {profile.firstName} {profile.lastName}
            </h1>
            <p className="text-muted-foreground">{profile.position || "User"}</p>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge variant="outline" className="bg-blue-50 border-blue-200">
                <Mail className="mr-1 h-3 w-3" />
                {profile.email}
              </Badge>
              {profile.phone && (
                <Badge variant="outline" className="bg-green-50 border-green-200">
                  <Phone className="mr-1 h-3 w-3" />
                  {profile.phone}
                </Badge>
              )}
              {profile.location && (
                <Badge variant="outline" className="bg-orange-50 border-orange-200">
                  <MapPin className="mr-1 h-3 w-3" />
                  {profile.location}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 bg-slate-100">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              Overview
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              Activity
            </TabsTrigger>
            <TabsTrigger value="tasks" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              Tasks
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="card-colorful card-hover">
                <CardHeader>
                  <CardTitle className="text-purple-600">Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(profile.position || profile.company) && (
                    <div className="grid grid-cols-[20px_1fr] items-start gap-2">
                      <Briefcase className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Work</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.position && profile.company 
                            ? `${profile.position} at ${profile.company}`
                            : profile.position || profile.company || "Not specified"
                          }
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-[20px_1fr] items-start gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Member Since</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="card-colorful card-hover">
                <CardHeader>
                  <CardTitle className="text-blue-600">Account Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Total Tasks</p>
                      <p className="text-2xl font-bold text-purple-600">{totalTasks}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p className="text-2xl font-bold text-green-600">{completedTasks}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Upcoming</p>
                      <p className="text-2xl font-bold text-blue-600">{upcomingTasks}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Productivity</p>
                      <p className="text-2xl font-bold text-orange-600">{productivity}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="activity">
            <Card className="card-colorful">
              <CardHeader>
                <CardTitle className="text-blue-600">Recent Activity</CardTitle>
                <CardDescription>Your recent task activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tasks.slice(0, 5).map((task, i) => (
                    <div key={task.id} className="flex items-start gap-4 border-b pb-4 last:border-0">
                      <div className={`rounded-full p-2 ${task.completed ? "bg-green-100" : "bg-blue-100"}`}>
                        <Calendar className={`h-4 w-4 ${task.completed ? "text-green-600" : "text-blue-600"}`} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {task.completed ? "Completed task" : "Created task"}
                        </p>
                        <p className="text-xs text-muted-foreground">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(task.date).toLocaleDateString()} at {task.startTime}
                        </p>
                      </div>
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No activity yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Start by creating some tasks!</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="tasks">
            <Card className="card-colorful">
              <CardHeader>
                <CardTitle className="text-green-600">Your Tasks</CardTitle>
                <CardDescription>Manage your tasks and track progress</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tasks.slice(0, 10).map((task) => (
                    <div key={task.id} className="flex items-center gap-4 border-b pb-4 last:border-0">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-gray-300" 
                        checked={task.completed}
                        readOnly
                      />
                      <div className="space-y-1 flex-1">
                        <p className={`text-sm font-medium ${task.completed ? "line-through opacity-70" : ""}`}>
                          {task.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(task.date).toLocaleDateString()} • {task.startTime} - {task.endTime}
                        </p>
                      </div>
                      <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "default" : "secondary"}>
                        {task.priority}
                      </Badge>
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No tasks yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Create your first task to get started!</p>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Link href="/" className="w-full">
                  <Button variant="outline" size="sm" className="w-full hover:bg-green-50 hover:border-green-300">
                    View All Tasks
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}