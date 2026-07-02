import json
import sys
import re
from datetime import datetime
import PyPDF2
from collections import Counter
import os

class ATSScoreCalculator:
    def __init__(self):
        # Common ATS keywords by category
        self.technical_keywords = {
            'programming': ['python', 'java', 'javascript', 'c++', 'c#', 'php', 'ruby', 'go', 'swift', 'kotlin', 'scala', 'r', 'matlab'],
            'web_development': ['html', 'css', 'react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'bootstrap', 'jquery'],
            'databases': ['sql', 'mysql', 'postgresql', 'mongodb', 'oracle', 'sqlite', 'redis', 'cassandra', 'elasticsearch'],
            'cloud_platforms': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'gitlab', 'github'],
            'data_science': ['machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit-learn', 'tableau', 'power bi'],
            'mobile_development': ['android', 'ios', 'react native', 'flutter', 'xamarin', 'cordova', 'ionic'],
            'frameworks': ['spring', 'hibernate', 'laravel', 'rails', '.net', 'asp.net', 'mvc', 'api', 'rest', 'graphql']
        }
        
        self.soft_skills_keywords = [
            'communication', 'leadership', 'teamwork', 'problem solving', 'analytical', 'creative',
            'adaptable', 'organized', 'detail-oriented', 'time management', 'project management',
            'collaboration', 'interpersonal', 'presentation', 'negotiation', 'critical thinking'
        ]
        
        self.industry_keywords = [
            'agile', 'scrum', 'devops', 'ci/cd', 'testing', 'debugging', 'optimization',
            'security', 'performance', 'scalability', 'microservices', 'architecture',
            'design patterns', 'version control', 'git', 'svn', 'code review'
        ]
        
        # Required sections for completeness scoring
        self.required_sections = [
            'contact_info', 'career_objective', 'education', 'skills', 'experience'
        ]
        
        self.optional_sections = [
            'projects', 'certifications', 'achievements', 'languages', 'hobbies'
        ]

    def extract_text_from_pdf(self, pdf_path):
        """Extract text from PDF resume"""
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text()
                return text.lower()
        except Exception as e:
            print(f"Error reading PDF: {str(e)}", file=sys.stderr)
            return ""

    def extract_keywords_from_profile(self, profile_data):
        """Extract keywords from profile data for comparison"""
        all_text = ""
        
        # Combine all text fields
        text_fields = [
            'careerObjective', 'skills', 'workExperience', 'projects',
            'certifications', 'achievements', 'degree', 'institutionName'
        ]
        
        for field in text_fields:
            if profile_data.get(field):
                all_text += " " + str(profile_data[field]).lower()
        
        return all_text

    def calculate_keyword_match_score(self, profile_data, resume_text=""):
        """Calculate keyword matching score"""
        # Use profile data if resume text is not available
        if not resume_text:
            resume_text = self.extract_keywords_from_profile(profile_data)
        
        total_keywords = 0
        matched_keywords = 0
        
        # Check technical keywords
        for category, keywords in self.technical_keywords.items():
            for keyword in keywords:
                total_keywords += 1
                if keyword in resume_text:
                    matched_keywords += 1
        
        # Check soft skills
        for keyword in self.soft_skills_keywords:
            total_keywords += 1
            if keyword in resume_text:
                matched_keywords += 1
        
        # Check industry keywords
        for keyword in self.industry_keywords:
            total_keywords += 1
            if keyword in resume_text:
                matched_keywords += 1
        
        # Calculate percentage (minimum 30% to account for specialized roles)
        keyword_score = max(30, (matched_keywords / total_keywords) * 100) if total_keywords > 0 else 30
        return min(100, keyword_score)

    def calculate_format_quality_score(self, profile_data, resume_text=""):
        """Calculate format and structure quality score"""
        score = 0
        
        # Check for proper contact information
        contact_score = 0
        if profile_data.get('fullName') and len(profile_data['fullName']) > 1:
            contact_score += 20
        if profile_data.get('email') and '@' in profile_data['email']:
            contact_score += 20
        if profile_data.get('phoneNumber'):
            contact_score += 10
        
        score += min(50, contact_score)
        
        # Check for professional links
        if profile_data.get('linkedinProfile'):
            score += 10
        if profile_data.get('portfolioGithub'):
            score += 10
        
        # Check text quality and length
        text_quality_score = 0
        
        # Career objective quality
        if profile_data.get('careerObjective'):
            obj_length = len(profile_data['careerObjective'])
            if 50 <= obj_length <= 300:
                text_quality_score += 10
            elif obj_length > 0:
                text_quality_score += 5
        
        # Skills section quality
        if profile_data.get('skills'):
            skills_count = len([s.strip() for s in profile_data['skills'].split(',') if s.strip()])
            if skills_count >= 5:
                text_quality_score += 10
            elif skills_count >= 3:
                text_quality_score += 5
        
        # Experience section quality
        if profile_data.get('workExperience'):
            exp_length = len(profile_data['workExperience'])
            if exp_length >= 100:
                text_quality_score += 10
            elif exp_length >= 50:
                text_quality_score += 5
        
        score += text_quality_score
        
        return min(100, score)

    def calculate_completeness_score(self, profile_data):
        """Calculate profile completeness score"""
        score = 0
        total_possible = 100
        
        # Required sections (70 points total)
        required_points = {
            'fullName': 10,
            'email': 10,
            'careerObjective': 15,
            'degree': 10,
            'skills': 15,
            'workExperience': 10
        }
        
        for field, points in required_points.items():
            if profile_data.get(field) and str(profile_data[field]).strip():
                score += points
        
        # Optional sections (30 points total)
        optional_points = {
            'phoneNumber': 5,
            'address': 3,
            'linkedinProfile': 5,
            'portfolioGithub': 5,
            'projects': 7,
            'certifications': 3,
            'achievements': 2
        }
        
        for field, points in optional_points.items():
            if profile_data.get(field) and str(profile_data[field]).strip():
                score += points
        
        return min(100, score)

    def calculate_ats_score(self, profile_data, resume_path=None):
        """Calculate overall ATS score"""
        try:
            # Extract text from resume if provided
            resume_text = ""
            if resume_path and os.path.exists(resume_path):
                resume_text = self.extract_text_from_pdf(resume_path)
            
            # Calculate individual scores
            keywords_score = self.calculate_keyword_match_score(profile_data, resume_text)
            format_score = self.calculate_format_quality_score(profile_data, resume_text)
            completeness_score = self.calculate_completeness_score(profile_data)
            
            # Weighted average (keywords: 40%, format: 35%, completeness: 25%)
            overall_score = (
                (keywords_score * 0.40) +
                (format_score * 0.35) +
                (completeness_score * 0.25)
            )
            
            return {
                'score': round(overall_score),
                'keywordsMatch': round(keywords_score),
                'formatQuality': round(format_score),
                'completeness': round(completeness_score),
                'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            
        except Exception as e:
            print(f"Error calculating ATS score: {str(e)}", file=sys.stderr)
            # Return default scores in case of error
            return {
                'score': 65,
                'keywordsMatch': 60,
                'formatQuality': 70,
                'completeness': 65,
                'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }

    def get_improvement_suggestions(self, profile_data, ats_scores):
        """Generate improvement suggestions based on ATS scores"""
        suggestions = []
        
        if ats_scores['keywordsMatch'] < 70:
            suggestions.append({
                'priority': 'high',
                'title': 'Add More Technical Skills',
                'description': 'Include programming languages and frameworks relevant to your target roles.'
            })
        
        if ats_scores['completeness'] < 80:
            missing_sections = []
            if not profile_data.get('projects'):
                missing_sections.append('projects')
            if not profile_data.get('certifications'):
                missing_sections.append('certifications')
            if not profile_data.get('achievements'):
                missing_sections.append('achievements')
            
            if missing_sections:
                suggestions.append({
                    'priority': 'medium',
                    'title': 'Complete Missing Sections',
                    'description': f'Add information about: {", ".join(missing_sections)}'
                })
        
        if ats_scores['formatQuality'] < 75:
            suggestions.append({
                'priority': 'medium',
                'title': 'Improve Contact Information',
                'description': 'Ensure all contact details are complete and professional links are included.'
            })
        
        # Always include some general suggestions
        suggestions.append({
            'priority': 'low',
            'title': 'Quantify Your Achievements',
            'description': 'Add numbers and metrics to showcase your impact in previous roles.'
        })
        
        return suggestions

def main():
    try:
        # Read arguments
        if len(sys.argv) < 2:
            print("Usage: python ats_calculator.py <profile_json> [resume_path]", file=sys.stderr)
            sys.exit(1)
        
        profile_json = sys.argv[1]
        resume_path = sys.argv[2] if len(sys.argv) > 2 else None
        
        # Parse profile data
        profile_data = json.loads(profile_json)
        
        # Calculate ATS score
        calculator = ATSScoreCalculator()
        ats_scores = calculator.calculate_ats_score(profile_data, resume_path)
        
        # Get improvement suggestions
        suggestions = calculator.get_improvement_suggestions(profile_data, ats_scores)
        
        result = {
            'success': True,
            'atsScores': ats_scores,
            'suggestions': suggestions
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            'success': False,
            'message': f'Error calculating ATS score: {str(e)}'
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()