export const mockInterview = {
  code: "AIR-2026-8XKQ4M",
  company: {
    name: "Ascendis Technologies",
    logoUrl: "/ai-recruiter-logo.png",
  },
  jobTitle: "Software Engineer",
  recruiter: {
    name: "Sarah Anderson",
    email: "sarah@ascendis.com",
  },
  candidate: {
    name: "John Doe",
    email: "john.doe@email.com",
  },
  interviewDate: new Date("2026-07-28T14:00:00"),
  duration: "45 Minutes",
  totalQuestions: 15,
  aiInterviewer: {
    name: "Emma",
    role: "AI Interviewer",
  },
  estimatedCompletion: "30-45 minutes",
  status: "scheduled" as const,
}

export const mockQuestions = [
  { id: 1, text: "Tell us about yourself and explain why you're interested in this position.", category: "Introduction" },
  { id: 2, text: "Describe a challenging project you worked on recently. What was your role and how did you contribute to its success?", category: "Experience" },
  { id: 3, text: "Can you walk us through your experience with React and TypeScript? How have you used them in production applications?", category: "Technical" },
  { id: 4, text: "How do you approach debugging complex issues in a large codebase? Walk us through your process.", category: "Problem Solving" },
  { id: 5, text: "Describe a time when you had to learn a new technology quickly for a project. How did you approach it?", category: "Adaptability" },
  { id: 6, text: "How do you handle code reviews? Can you give an example of feedback you received that significantly improved your work?", category: "Collaboration" },
  { id: 7, text: "Tell us about a time you disagreed with a technical decision. How did you handle it?", category: "Communication" },
  { id: 8, text: "What is your approach to writing clean, maintainable code? Can you share some principles you follow?", category: "Technical" },
  { id: 9, text: "Describe your experience with testing. How do you decide what to test and what testing strategies do you use?", category: "Technical" },
  { id: 10, text: "How do you prioritize tasks when working on multiple features simultaneously?", category: "Project Management" },
  { id: 11, text: "Tell us about a time you mentored someone or helped a teammate grow their skills.", category: "Leadership" },
  { id: 12, text: "What excites you most about working at a fast-growing technology company?", category: "Motivation" },
  { id: 13, text: "How do you stay current with new technologies and industry trends?", category: "Growth" },
  { id: 14, text: "Where do you see yourself in five years, and how does this role align with your career goals?", category: "Career" },
  { id: 15, text: "Do you have any questions for us about the role or the company?", category: "Closing" },
]
